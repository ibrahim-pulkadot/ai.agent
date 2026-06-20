import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { HISTORY_DIR } from "./config.js";
import { writeJsonAtomic, readJsonSafe } from "./fsutil.js";

function ensureDir() {
  if (!existsSync(HISTORY_DIR)) mkdirSync(HISTORY_DIR, { recursive: true });
}

/** sessionId -> history/chat-<sessionId>.json */
function historyPath(sessionId) {
  const safe = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(HISTORY_DIR, `chat-${safe}.json`);
}

/**
 * Bir oturumun TUM mesaj gecmisini yukler.
 * Yapisi: { id, createdAt, messages: [{ role, content, ts }] }
 */
export function loadHistory(sessionId) {
  ensureDir();
  const fallback = { id: String(sessionId), createdAt: new Date().toISOString(), messages: [] };
  const data = readJsonSafe(historyPath(sessionId), fallback);
  if (!Array.isArray(data.messages)) data.messages = [];
  if (!data.id) data.id = String(sessionId);
  return data;
}

/** TUM gecmis diske atomik yazilir (hicbir mesaj silinmez). */
export function saveHistory(history) {
  ensureDir();
  writeJsonAtomic(historyPath(history.id), history);
}

/** Gecmise bir mesaj ekler ve kaydeder. */
export function appendMessage(history, role, content) {
  history.messages.push({ role, content, ts: new Date().toISOString() });
  saveHistory(history);
}

/**
 * Modele beslenecek son N mesaji dondurur (sadece role+content).
 * Tum gecmis diskte kalir; bu sadece "calisma hafizasi" penceresidir.
 */
export function recentWindow(history, n) {
  return history.messages
    .slice(-n)
    .map((m) => ({ role: m.role, content: m.content }));
}
