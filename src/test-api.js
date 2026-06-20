import OpenAI from "openai";
import { config } from "./config.js";

// VoidAI baglantisini ve secili modeli hizlica test eder.
const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });

console.log(`Model: ${config.model}`);
console.log(`Base URL: ${config.baseURL}`);
console.log("Test mesaji gonderiliyor...\n");

try {
  const res = await client.chat.completions.create({
    model: config.model,
    messages: [
      { role: "system", content: "Kullaniciya 'Patron' diye hitap eden bir asistansin." },
      { role: "user", content: "Tek cumleyle kendini tanit." },
    ],
  });
  console.log("CEVAP:", res.choices?.[0]?.message?.content);
  console.log("\nBaglanti calisiyor, Patron.");
} catch (err) {
  console.error("API HATASI:", err?.status || "", err?.message || err);
  if (err?.response?.data) console.error(JSON.stringify(err.response.data, null, 2));
  process.exit(1);
}
