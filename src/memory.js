import { MEMORY_FILE } from "./config.js";
import { writeJsonAtomic, readJsonSafe } from "./fsutil.js";
import { normalizeDate, todayISO, MONTHS_TR } from "./datetime.js";

const EMPTY = { profile: {}, facts: [] };

// Hafizaya yazilan serbest metinler icin guvenlik sinirlari (prompt injection + sismeye karsi).
const MAX_KEY = 100;
const MAX_VALUE = 500;
const MAX_CONTENT = 1000;

/** Kontrol karakterlerini temizler, bosluklari sadelestir, prompt sinirlayicilarini etkisizlestirir, kirpar. */
function sanitize(text, max) {
  return String(text)
    .replace(new RegExp("[\\x00-\\x1f\\x7f]", "g"), " ") // kontrol karakterleri
    .replace(/={3,}/g, "==") // sahte "=== HAFIZA SONU ===" sinirlayici taklidini boz
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Dedupe icin metni normalize eder (kucuk harf + tek bosluk). */
function normText(text) {
  return String(text).toLocaleLowerCase("tr").replace(/\s+/g, " ").trim();
}

/** memory.json'u oku. Yoksa/bozuksa bos yapida dondur. */
export function loadMemory() {
  const data = readJsonSafe(MEMORY_FILE, EMPTY);
  return {
    profile: data.profile && typeof data.profile === "object" ? data.profile : {},
    facts: Array.isArray(data.facts) ? data.facts : [],
  };
}

/** Hafizayi diske atomik yazar (insan okuyabilsin diye pretty-print). */
export function saveMemory(memory) {
  writeJsonAtomic(MEMORY_FILE, memory);
}

function nextId(facts) {
  return facts.reduce((max, f) => Math.max(max, Number(f.id) || 0), 0) + 1;
}

/**
 * Kalici kimlik bilgisi kaydet (isim, dogum gunu, ev, tercih vb.).
 * Ayni anahtar varsa uzerine yazar.
 */
export function rememberProfile(memory, { key, value }) {
  if (!key || value == null || String(value).trim() === "") {
    return { ok: false, error: "key ve value gerekli" };
  }
  const cleanKey = sanitize(key, MAX_KEY);
  if (!cleanKey) return { ok: false, error: "gecersiz key" };
  memory.profile[cleanKey] = sanitize(value, MAX_VALUE);
  saveMemory(memory);
  return { ok: true, saved: { [cleanKey]: memory.profile[cleanKey] } };
}

/**
 * Tarihli bir olay/is/not kaydet.
 * date verilmezse veya cozulemezse bugunun tarihi kullanilir (YYYY-MM-DD).
 */
export function rememberEvent(memory, { content, date, category }) {
  if (!content || !String(content).trim()) return { ok: false, error: "content gerekli" };
  const text = sanitize(content, MAX_CONTENT);

  const resolved = normalizeDate(date);
  const when = resolved || todayISO();
  // Model bir tarih verdi ama cozemediysek bunu isaretle (sessiz yanlis tarihi onlemek icin).
  const dateUncertain = Boolean(date && !resolved);

  // Tekrar onleme: ayni gun + normalize edilmis ayni metin varsa tekrar ekleme.
  const dup = memory.facts.find(
    (f) => f.date === when && normText(f.content) === normText(text)
  );
  if (dup) return { ok: true, deduped: true, id: dup.id };

  const fact = {
    id: nextId(memory.facts),
    content: text,
    date: when,
    category: category ? sanitize(category, 40) : "genel",
    createdAt: new Date().toISOString(),
    ...(dateUncertain ? { dateUncertain: true } : {}),
  };
  memory.facts.push(fact);
  saveMemory(memory);
  return { ok: true, saved: fact, ...(dateUncertain ? { dateUncertain: true } : {}) };
}

/** Hafizadan metinle eslesen kayitlari sil. */
export function forget(memory, { query }) {
  if (!query) return { ok: false, error: "query gerekli" };
  const q = String(query).toLocaleLowerCase("tr");
  const removed = memory.facts.filter((f) => f.content.toLocaleLowerCase("tr").includes(q));
  memory.facts = memory.facts.filter((f) => !f.content.toLocaleLowerCase("tr").includes(q));

  for (const [k, v] of Object.entries(memory.profile)) {
    if (k.toLocaleLowerCase("tr").includes(q) || String(v).toLocaleLowerCase("tr").includes(q)) {
      delete memory.profile[k];
      removed.push({ profile: { [k]: v } });
    }
  }
  saveMemory(memory);
  // removed dizisi hem silinen fact'leri hem profile girdilerini tutar -> tek dogru sayac.
  return { ok: true, removedCount: removed.length, removed };
}

/** ISO tarihi ("2026-06-19") okunabilir Turkce'ye cevirir ("19 Haziran 2026"). */
function humanDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${+m[3]} ${MONTHS_TR[+m[2] - 1]} ${+m[1]}`;
}

/** Hafizayi okunabilir bir metne cevirip sistem promptuna gomeriz. */
export function formatMemoryForPrompt(memory) {
  const lines = [];

  const profileKeys = Object.keys(memory.profile || {});
  if (profileKeys.length) {
    lines.push("## Patron hakkinda bilinenler (kimlik bilgileri)");
    for (const k of profileKeys) lines.push(`- ${k}: ${memory.profile[k]}`);
  }

  if (memory.facts?.length) {
    lines.push("");
    lines.push("## Kayitli olaylar / isler / notlar (tarihli)");
    const sorted = [...memory.facts].sort((a, b) => (a.date < b.date ? 1 : -1));
    for (const f of sorted) {
      const flag = f.dateUncertain ? " (tarih belirsiz)" : "";
      lines.push(`- ${humanDate(f.date)} [${f.date}]${flag} (${f.category}): ${f.content}`);
    }
  }

  if (!lines.length) return "(Henuz kayitli bir hafiza yok.)";
  return lines.join("\n");
}

export { todayISO };
