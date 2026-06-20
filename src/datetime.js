import { config } from "./config.js";

export const MONTHS_TR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
const MONTHS_ABBR = ["oca", "şub", "mar", "nis", "may", "haz", "tem", "ağu", "eyl", "eki", "kas", "ara"];
const WEEKDAYS_TR = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

const pad = (n) => String(n).padStart(2, "0");

/** Yapilandirilmis saat dilimine (varsayilan Europe/Istanbul) gore bugunun parcalari. */
function tzParts(date = new Date()) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const map = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return { y: Number(map.year), m: Number(map.month), d: Number(map.day) };
}

/** Bugun (dogru saat diliminde) -> "YYYY-MM-DD". */
export function todayISO() {
  const { y, m, d } = tzParts();
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Bugun -> "19 Haziran 2026 Cuma" gibi okunabilir Turkce metin. */
export function humanToday() {
  const { y, m, d } = tzParts();
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${d} ${MONTHS_TR[m - 1]} ${y} ${WEEKDAYS_TR[wd]}`;
}

/** ISO tarihinden (gun ofsetiyle) UTC-guvenli yeni ISO uretir. */
function isoFromOffset(days) {
  const { y, m, d } = tzParts();
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + days);
  return `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(base.getUTCDate())}`;
}

/** YYYY-MM-DD'nin gercekten gecerli bir takvim tarihi oldugunu dogrular (2009-13-45 reddedilir). */
function isValidISO(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function monthIndexTR(name) {
  const n = name.toLocaleLowerCase("tr");
  const full = MONTHS_TR.findIndex((m) => m.toLocaleLowerCase("tr") === n);
  if (full !== -1) return full;
  const abbr = MONTHS_ABBR.indexOf(n.slice(0, 3));
  return abbr;
}

/**
 * Cesitli tarih girdilerini "YYYY-MM-DD"ye cevirir. Cozemezse null doner
 * (null donerse cagiran taraf bugune dusebilir). Desteklenen formatlar:
 *  - YYYY-MM-DD (dogrulanir)
 *  - goreli: bugun, dun, yarin, evvelsi/onceki gun, obur gun, gecen hafta
 *  - "19 Ocak 2009" / "19 Oca 2009" (Turkce ay adlari)
 *  - DD.MM.YYYY veya DD/MM/YYYY
 *  - "-3d" / "+2d" gibi gun ofsetleri
 * Belirsiz serbest metinler (new Date) BILEREK denenmez (saat dilimi kaymasi riski).
 */
export function normalizeDate(input) {
  if (input == null) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  const s = raw.toLocaleLowerCase("tr");

  if (isValidISO(raw)) return raw;

  // Goreli ifadeler
  const rel = {
    "bugün": 0, "bugun": 0, "today": 0,
    "dün": -1, "dun": -1, "yesterday": -1,
    "yarın": 1, "yarin": 1, "tomorrow": 1,
    "evvelsi gün": -2, "evvelki gün": -2, "önceki gün": -2, "onceki gun": -2,
    "öbür gün": 2, "obur gun": 2,
    "geçen hafta": -7, "gecen hafta": -7,
  };
  if (s in rel) return isoFromOffset(rel[s]);

  // "-3d" / "+2d"
  const off = /^([+-]?\d+)\s*g(?:ün|un)?$/.exec(s) || /^([+-]?\d+)\s*d$/.exec(s);
  if (off) return isoFromOffset(Number(off[1]));

  // "19 Ocak 2009"
  const tr = /^(\d{1,2})\s+([a-zçğıöşü]+)\s+(\d{4})$/.exec(s);
  if (tr) {
    const day = +tr[1];
    const mi = monthIndexTR(tr[2]);
    const year = +tr[3];
    if (mi >= 0) {
      const cand = `${year}-${pad(mi + 1)}-${pad(day)}`;
      if (isValidISO(cand)) return cand;
    }
  }

  // DD.MM.YYYY veya DD/MM/YYYY
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
  if (dmy) {
    const cand = `${+dmy[3]}-${pad(+dmy[2])}-${pad(+dmy[1])}`;
    if (isValidISO(cand)) return cand;
  }

  return null;
}

// ---- Hatirlatma / zamanlayici icin gelecek zaman cozumu ----

/** Verilen TZ'de, belirli bir an icin UTC ofsetini (ms) hesaplar. */
function tzOffsetMs(tz, dateMs) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const map = {};
  for (const p of dtf.formatToParts(new Date(dateMs))) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const hour = map.hour === "24" ? "00" : map.hour;
  const asUTC = Date.UTC(+map.year, +map.month - 1, +map.day, +hour, +map.minute, +map.second);
  return asUTC - dateMs;
}

/** Belirli bir TZ'deki "duvar saati"ni (y-mo-d h:mi) epoch ms'e cevirir. */
function zonedWallToEpoch(y, mo, d, h, mi, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const off = tzOffsetMs(tz, guess);
  let epoch = guess - off;
  const off2 = tzOffsetMs(tz, epoch); // DST sinirlari icin tek duzeltme
  if (off2 !== off) epoch = guess - off2;
  return epoch;
}

/** epoch ms -> "19 Haziran 2026 21:10" (yapilandirilmis TZ'de, Turkce). */
export function humanDateTime(ms) {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: config.timezone,
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(ms));
}

/** Su an -> "19 Haziran 2026 14:05". */
export function humanNow() {
  return humanDateTime(Date.now());
}

/**
 * Dogal dildeki gelecek zaman ifadesini cozer ve { ms, iso, human } doner.
 * Cozemezse null. Desteklenen: "21:10", "21.10", "yarin 09:00", "bugun 21:10",
 * "10 dakika sonra", "2 saat sonra", "30 saniye sonra", "yarim saat sonra".
 */
export function parseFutureTime(input) {
  if (input == null) return null;
  const now = Date.now();
  const mk = (ms) => (ms > now - 1000 ? { ms, iso: new Date(ms).toISOString(), human: humanDateTime(ms) } : null);

  let s = String(input).trim().toLocaleLowerCase("tr");
  s = s
    .replace(/['’](?:de|da|te|ta|ye|ya)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Once "... sonra" sureleri (buradan once "saat" kelimesi silinmemeli).
  // Cekimli ekler de kabul: "1 saatten sonra", "10 dakikadan sonra" vb.
  let m;
  if (/^yar[iı]m saat(?:ten)? sonra$/.test(s)) return mk(now + 30 * 60000);
  if ((m = /^(\d+)\s*(?:saniye|saniyeden|sn)\s+sonra$/.exec(s))) return mk(now + Number(m[1]) * 1000);
  if ((m = /^(\d+)\s*(?:dakika|dakikadan|dk|dakka)\s+sonra$/.exec(s))) return mk(now + Number(m[1]) * 60000);
  if ((m = /^(\d+)\s*(?:saat|saatten)\s+sonra$/.exec(s))) return mk(now + Number(m[1]) * 3600000);

  // "saat 21:10" -> bastaki "saat" kelimesini at
  s = s.replace(/^saat\s+/, "").trim();

  let dayOffset = 0;
  let explicitDay = false;
  if (/^yar[iı]n\b/.test(s)) { dayOffset = 1; explicitDay = true; s = s.replace(/^yar[iı]n\b/, "").trim(); }
  else if (/^bug[uü]n\b/.test(s)) { dayOffset = 0; explicitDay = true; s = s.replace(/^bug[uü]n\b/, "").trim(); }
  else if (/^(?:obur gun|öbür gün)\b/.test(s)) { dayOffset = 2; explicitDay = true; s = s.replace(/^(?:obur gun|öbür gün)\b/, "").trim(); }

  // Gun tokeninden sonra da "saat" kalmis olabilir: "yarin saat 9"
  s = s.replace(/^saat\s+/, "").trim();

  // HH:MM (tek haneli dakikaya da izin: "9:5" -> 09:05)
  if ((m = /^(\d{1,2})[:.](\d{1,2})$/.exec(s))) {
    const h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return null;
    const { y, m: mo, d } = tzParts();
    let epoch = zonedWallToEpoch(y, mo, d + dayOffset, h, mi, config.timezone);
    if (dayOffset === 0 && epoch <= now) {
      if (explicitDay) return null; // "bugun" acikca dendi ama saat gecmis -> ust katman uyarsin
      epoch = zonedWallToEpoch(y, mo, d + 1, h, mi, config.timezone); // gun belirtilmedi -> yarin
    }
    return mk(epoch);
  }

  // sadece saat: "9" -> 09:00
  if ((m = /^(\d{1,2})$/.exec(s))) {
    const h = +m[1];
    if (h > 23) return null;
    const { y, m: mo, d } = tzParts();
    let epoch = zonedWallToEpoch(y, mo, d + dayOffset, h, 0, config.timezone);
    if (dayOffset === 0 && epoch <= now) {
      if (explicitDay) return null;
      epoch = zonedWallToEpoch(y, mo, d + 1, h, 0, config.timezone);
    }
    return mk(epoch);
  }

  return null;
}
