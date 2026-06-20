import TelegramBot from "node-telegram-bot-api";
import { config, loadPersona } from "./config.js";
import { handleMessage } from "./agent.js";
import { startScheduler } from "./scheduler.js";

if (!config.telegramToken) {
  console.error(
    "HATA: TELEGRAM_BOT_TOKEN ayarlanmamis. .env dosyasina @BotFather'dan aldigin token'i ekle."
  );
  process.exit(1);
}

const persona = loadPersona();
const bot = new TelegramBot(config.telegramToken, { polling: true });

if (config.telegramAllowedIds.length === 0) {
  console.warn(
    "\x1b[33mUYARI: TELEGRAM_ALLOWED_IDS bos. Botu bulan HERKES kisisel hafizana erisebilir.\n" +
      "Sadece kendin kullanmak icin .env'e kendi Telegram ID'ni ekle (@userinfobot).\x1b[0m"
  );
}

function isAllowed(userId) {
  if (config.telegramAllowedIds.length === 0) return true; // belgelenmis varsayilan (bkz. UYARI)
  return config.telegramAllowedIds.includes(String(userId));
}

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  const text = msg.text?.trim();

  if (!text) return;

  if (!isAllowed(userId)) {
    await bot.sendMessage(chatId, "Bu bot ozeldir Patron, sana izin yok.");
    return;
  }

  if (text === "/start") {
    await bot.sendMessage(chatId, `Selam Patron! Ben ${persona.botName}. Buyur, dinliyorum.`);
    return;
  }

  try {
    await bot.sendChatAction(chatId, "typing");
    // Her Telegram sohbeti kendi oturum dosyasini kullanir; hatirlatmalar bu chat'e gider.
    const reply = await handleMessage(text, `tg-${chatId}`, { telegramChatId: chatId });
    await bot.sendMessage(chatId, reply);
  } catch (err) {
    console.error("Telegram hata:", err?.message || err);
    await bot.sendMessage(chatId, "Patron, bir terslik oldu, tekrar dener misin?");
  }
});

bot.on("polling_error", (err) => {
  console.error("Polling hatasi:", err?.message || err);
});

// Zamanlayiciyi baslat: suresi gelen hatirlatmalari Telegram'dan gonderir.
startScheduler((chatId, message) => bot.sendMessage(chatId, `⏰ ${message}`));

console.log(`${persona.botName} Telegram'da calisiyor, Patron. (Ctrl+C ile durdur)`);
console.log("Zamanlayici aktif: kurulan hatirlatmalar zamani gelince gonderilecek.");
