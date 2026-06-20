import {
  writeFileSync,
  renameSync,
  readFileSync,
  existsSync,
  copyFileSync,
} from "node:fs";

/**
 * JSON'u atomik yazar: once .tmp dosyasina yazip sonra rename eder.
 * rename ayni disk uzerinde atomiktir; okuyucular ya eski ya yeni TAM
 * dosyayi gorur, yarim/bozuk dosya kalmaz (cokme/Ctrl+C'ye dayanikli).
 */
export function writeJsonAtomic(file, obj) {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
  renameSync(tmp, file);
}

/**
 * JSON'u guvenli okur. Dosya yoksa fallback'in kopyasini doner.
 * Dosya bozuksa sessizce bos donmek yerine ONCE .bak yedegi alir,
 * sonra fallback doner; boylece veri kurtarilabilir kalir.
 */
export function readJsonSafe(file, fallback) {
  if (!existsSync(file)) return structuredClone(fallback);
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    try {
      copyFileSync(file, `${file}.corrupt-${Date.now()}.bak`);
      console.error(`UYARI: ${file} bozuktu, yedegi alindi (.bak).`);
    } catch {
      /* yedek alinamazsa bile devam et */
    }
    return structuredClone(fallback);
  }
}
