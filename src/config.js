import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, "..");

export const MEMORY_FILE = join(ROOT, "memory.json");
export const HISTORY_DIR = join(ROOT, "history");
export const PERSONA_FILE = join(ROOT, "persona.json");

export const config = {
  apiKey: process.env.VOIDAI_API_KEY,
  baseURL: process.env.VOIDAI_BASE_URL || "https://api.voidai.app/v1",
  model: process.env.AI_MODEL || "gpt-4.1-mini",
  historyWindow: Number(process.env.HISTORY_WINDOW || 25),
  timezone: process.env.TIMEZONE || "Europe/Istanbul",
  maxInputChars: Number(process.env.MAX_INPUT_CHARS || 8000),
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || "",
  telegramAllowedIds: (process.env.TELEGRAM_ALLOWED_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

if (!config.apiKey) {
  console.error(
    "HATA: VOIDAI_API_KEY ayarlanmamis. .env dosyasini olusturup anahtarini gir."
  );
  process.exit(1);
}

const DEFAULT_PERSONA = {
  botName: "Mira",
  address: "Patron",
  language: "Türkçe",
  traits: ['Kullanıcıya "Patron" diye hitap eder.'],
  extraInstructions: "",
};

/** persona.json'u her cagrida taze okur ki dosyadan duzenleme aninda etkili olsun. */
export function loadPersona() {
  let p;
  try {
    p = JSON.parse(readFileSync(PERSONA_FILE, "utf8"));
  } catch {
    return { ...DEFAULT_PERSONA };
  }
  // Eksik/bos alanlari guvenli varsayilanlara cek ("address" asla bos kalmasin).
  return {
    botName: p.botName?.trim() || DEFAULT_PERSONA.botName,
    address: p.address?.trim() || DEFAULT_PERSONA.address,
    language: p.language?.trim() || DEFAULT_PERSONA.language,
    traits: Array.isArray(p.traits) && p.traits.length ? p.traits : DEFAULT_PERSONA.traits,
    extraInstructions: typeof p.extraInstructions === "string" ? p.extraInstructions : "",
  };
}
