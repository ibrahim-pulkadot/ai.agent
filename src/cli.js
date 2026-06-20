import readline from "node:readline";
import { handleMessage } from "./agent.js";
import { loadPersona, config } from "./config.js";

// CLI oturum kimligi: argumandan al (orn: `npm run cli -- 2`), yoksa "1".
const sessionId = process.argv[2] || "1";
const persona = loadPersona();

// CLI'dan kurulan hatirlatmalar, izin verilen ilk Telegram ID'sine gonderilir
// (gonderim Telegram botu calisirken yapilir).
const context = { telegramChatId: config.telegramAllowedIds[0] || null };

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask() {
  rl.question("\x1b[36mPatron >\x1b[0m ", async (line) => {
    const text = line.trim();

    if (!text) return ask();
    if (["/cikis", "/exit", "/quit", "/q"].includes(text.toLowerCase())) {
      console.log(`\n${persona.botName}: Gorusuruz Patron!`);
      rl.close();
      return;
    }

    try {
      process.stdout.write(`\x1b[33m${persona.botName} dusunuyor...\x1b[0m\r`);
      const reply = await handleMessage(text, sessionId, context);
      process.stdout.write("\x1b[2K"); // satiri temizle
      console.log(`\x1b[32m${persona.botName}:\x1b[0m ${reply}\n`);
    } catch (err) {
      process.stdout.write("\x1b[2K");
      console.error(`\x1b[31mHata:\x1b[0m ${err?.message || err}\n`);
    }
    ask();
  });
}

console.log(`\x1b[1m${persona.botName}\x1b[0m hazir, Patron. (oturum: ${sessionId})`);
console.log("Cikmak icin: /cikis\n");
ask();
