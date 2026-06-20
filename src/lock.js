import { mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./config.js";

// Anahtar bazli basit async mutex (kuyruk) -- SUREC ICI.
// Ayni "key" icin verilen isleri SIRAYLA calistirir; boylece dosya
// okuma-degistir-yaz islemlerinde yaris kosulu (lost update) olusmaz.
const tails = new Map();

export function withLock(key, fn) {
  const prev = tails.get(key) || Promise.resolve();
  const run = prev.then(() => fn());
  // Hata zinciri kirmasin diye tail her zaman basariyla cozulur.
  const tail = run.then(
    () => {},
    () => {}
  );
  tails.set(key, tail);
  // Harita sonsuz buyumesin: bu is sonuncuysa anahtari temizle.
  tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return run;
}

// --- SURECLER-ARASI kilit (mkdir atomik oldugu icin CLI + Telegram surecleri
// arasinda da calisir). memory.json ve schedules.json gibi PAYLASILAN dosyalarin
// oku-degistir-yaz dizisini korur. Ayni surecte de serilestirir. ---
const LOCK_DIR = join(ROOT, ".locks");
const STALE_MS = 30000; // sahipsiz/cokmus kilit en fazla 30 sn sonra devralinir
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function withFileLock(name, fn, { timeoutMs = 15000, retryMs = 30 } = {}) {
  try {
    mkdirSync(LOCK_DIR, { recursive: true });
  } catch {
    /* zaten var */
  }
  const lockPath = join(LOCK_DIR, `${name}.lock`);
  const start = Date.now();

  for (;;) {
    try {
      mkdirSync(lockPath); // atomik: dizin varsa hata firlatir
      break;
    } catch {
      // Bayat kilit devralma
      try {
        const st = statSync(lockPath);
        if (Date.now() - st.mtimeMs > STALE_MS) {
          rmSync(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch {
        /* stat edilemezse tekrar dene */
      }
      if (Date.now() - start > timeoutMs) {
        // Kilit alinamadi: tam kilitlenmeyi onlemek icin yine de calis (best-effort).
        return fn();
      }
      await sleep(retryMs);
    }
  }

  try {
    return await fn();
  } finally {
    try {
      rmSync(lockPath, { recursive: true, force: true });
    } catch {
      /* zaten silinmis */
    }
  }
}
