import { join } from "node:path";
import { ROOT } from "./config.js";
import { writeJsonAtomic, readJsonSafe } from "./fsutil.js";
import { withFileLock } from "./lock.js";
import { parseFutureTime } from "./datetime.js";

const SCHEDULES_FILE = join(ROOT, "schedules.json");
const MAX_ATTEMPTS = 5;
const KEEP_DONE_MS = 7 * 24 * 60 * 60 * 1000; // tamamlananlari 7 gun sakla

function load() {
  const d = readJsonSafe(SCHEDULES_FILE, { items: [] });
  if (!Array.isArray(d.items)) d.items = [];
  return d;
}
function save(d) {
  writeJsonAtomic(SCHEDULES_FILE, d);
}
function nextId(items) {
  return items.reduce((max, i) => Math.max(max, Number(i.id) || 0), 0) + 1;
}

function addSchedule(item) {
  // Surecler-arasi kilit: id uretimi + yazma taze okuma uzerinden yapilir.
  return withFileLock("schedules", () => {
    const d = load();
    const rec = {
      id: nextId(d.items),
      chatId: String(item.chatId),
      fireAt: item.fireAtIso,
      fireAtMs: item.fireAtMs,
      fireAtHuman: item.fireAtHuman,
      message: item.message,
      done: false,
      attempts: 0,
      createdAt: new Date().toISOString(),
    };
    d.items.push(rec);
    save(d);
    return rec;
  });
}

/** Bekleyen (tamamlanmamis) hatirlatmalari listeler. chatId zorunlu. */
export function listSchedules(chatId) {
  if (chatId == null) return [];
  const cid = String(chatId);
  const d = load();
  return d.items
    .filter((i) => !i.done && String(i.chatId) === cid)
    .map((i) => ({ id: i.id, time: i.fireAtHuman, message: i.message }));
}

/** Bir hatirlatmayi iptal eder. chatId zorunlu (baska kullanicinin kaydina dokunamaz). */
export function cancelSchedule({ id, chatId }) {
  if (chatId == null) return { ok: false, error: "chatId gerekli" };
  const cid = String(chatId);
  return withFileLock("schedules", () => {
    const d = load();
    const before = d.items.length;
    d.items = d.items.filter((i) => {
      const match =
        String(i.chatId) === cid && !i.done && (id == null || Number(i.id) === Number(id));
      return !match;
    });
    save(d);
    const removed = before - d.items.length;
    return { ok: removed > 0, removed };
  });
}

/**
 * Dogal dildeki zaman ifadesinden hatirlatma olusturur.
 * @returns {Promise<object>} arac sonucu
 */
export async function createReminder({ chatId, time, message }) {
  if (!chatId) {
    return {
      ok: false,
      error:
        "Hatirlatma icin Telegram hedefi yok. Telegram'dan kur ya da .env'de TELEGRAM_ALLOWED_IDS ayarli olsun.",
    };
  }
  const t = parseFutureTime(time);
  if (!t) {
    return {
      ok: false,
      error: `Zaman anlasilamadi: "${time}". Ornek: "21:10", "yarin 09:00", "10 dakika sonra".`,
    };
  }
  const msg = (message && String(message).trim()) || "Patron, kurdugun hatirlatmanin vakti geldi!";
  const rec = await addSchedule({
    chatId,
    fireAtMs: t.ms,
    fireAtIso: t.iso,
    fireAtHuman: t.human,
    message: msg,
  });
  return {
    ok: true,
    id: rec.id,
    fireAt: t.human,
    message: msg,
    note: "Teslimat Telegram'dan yapilir; hatirlatmanin gelmesi icin Telegram botu (npm run telegram) acik olmali.",
  };
}

/**
 * Zamanlayiciyi baslatir. Tek bir surecte (Telegram botu) calismali.
 * Akis: (1) kilit altinda suresi gelenleri TOPLA; (2) kilit DISINDA gonder;
 * (3) kilit altinda sonuclari (done/attempts) yaz. Boylece ag cagrisi
 * kilidi tutmaz ve es zamanli set_reminder bloke olmaz.
 * @param {(chatId:string, message:string)=>Promise<any>} send
 * @param {number} intervalMs
 * @returns {() => void} durdurucu
 */
export function startScheduler(send, intervalMs = 15000) {
  let running = false; // ust uste tick'leri onler (kilit DISINDA, bu yuzden etkili)

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      // 1) Suresi gelenleri kilit altinda topla + eski tamamlananlari buda.
      const due = await withFileLock("schedules", () => {
        const d = load();
        const now = Date.now();
        const fresh = d.items.filter((i) => {
          if (!i.done) return true; // bekleyen daima kalir
          const ref = i.firedAt ? Date.parse(i.firedAt) : i.fireAtMs || Date.parse(i.createdAt) || 0;
          return now - ref < KEEP_DONE_MS;
        });
        if (fresh.length !== d.items.length) {
          d.items = fresh;
          save(d);
        }
        return d.items
          .filter((i) => !i.done && i.fireAtMs <= now)
          .map((i) => ({ id: i.id, chatId: i.chatId, message: i.message }));
      });

      if (!due.length) return;

      // 2) Kilit DISINDA gonder.
      const results = [];
      for (const it of due) {
        try {
          await send(it.chatId, it.message);
          results.push({ id: it.id, ok: true });
        } catch (e) {
          results.push({ id: it.id, ok: false, err: e?.message || String(e) });
        }
      }

      // 3) Sonuclari kilit altinda taze okuyup yaz.
      await withFileLock("schedules", () => {
        const d = load();
        for (const r of results) {
          const it = d.items.find((x) => x.id === r.id);
          if (!it || it.done) continue;
          if (r.ok) {
            it.done = true;
            it.firedAt = new Date().toISOString();
          } else {
            it.attempts = (it.attempts || 0) + 1;
            console.error(`Hatirlatma gonderilemedi (deneme ${it.attempts}/${MAX_ATTEMPTS}): ${r.err}`);
            if (it.attempts >= MAX_ATTEMPTS) {
              it.done = true;
              it.firedAt = new Date().toISOString();
              it.failed = true;
              console.error(
                `Hatirlatma KALICI BASARISIZ (id ${it.id}, chat ${it.chatId}): ${it.message}`
              );
            }
          }
        }
        save(d);
      });
    } catch (e) {
      console.error("scheduler tick hata:", e?.message || e);
    } finally {
      running = false;
    }
  };

  tick(); // baslar baslamaz gecikmis olanlari yakala
  const handle = setInterval(() => {
    tick().catch(() => {});
  }, intervalMs);
  return () => clearInterval(handle);
}
