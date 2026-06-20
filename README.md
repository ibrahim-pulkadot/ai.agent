# Mira — Patron'un Kişisel AI Agent'ı

Sana **"Patron"** diye seslenen, kalıcı hafızası olan ve hem komut satırından (CLI) hem
Telegram'dan konuşulabilen kişisel bir yapay zeka asistanı.

## Ne yapar?

- **Kalıcı hafıza (`memory.json`)**: Paylaştığın önemli bilgileri otomatik algılar ve kaydeder.
  - _"Benim doğum günüm 19 Ocak 2009"_ → kimlik bilgisi olarak kaydedilir.
  - _"Bugün dağ evinin alt tarafındaki toprakları düzledim"_ → tarihiyle olay olarak kaydedilir.
  - _"Dağ evinin alt tarafındaki toprakları ne zaman düzledim?"_ →
    _"Patron, dağ evinin alt tarafındaki toprakları **12 Haziran 2026**'da düzledin."_
- **Sohbet geçmişi (`history/chat-*.json`)**: Tüm mesajlar diske kaydedilir; AI'ın anlık
  çalışma hafızası ise son ~25 mesajdır (`.env` içinden ayarlanır).
- **İki arayüz**: Terminal (CLI) ve Telegram botu — ikisi de aynı hafızayı kullanır.
- **Kişilik (`persona.json`)**: İsmi, hitap şekli ve karakteri düzenlenebilir.

## Kurulum

```bash
npm install
```

`.env` dosyası anahtarınla birlikte hazır geldi. İçindekiler:

```
VOIDAI_API_KEY=...        # VoidAI anahtarın
AI_MODEL=gpt-5.1          # kullanılacak model
HISTORY_WINDOW=25         # AI'ın hatırlayacağı son mesaj sayısı
TIMEZONE=Europe/Istanbul  # tarih hesapları için saat dilimi
MAX_INPUT_CHARS=8000      # tek mesaj için karakter sınırı
TELEGRAM_BOT_TOKEN=       # Telegram için (CLI'da gerekmez)
TELEGRAM_ALLOWED_IDS=     # sadece bu ID'ler kullanabilsin (boş = herkes)
```

## ⚠️ Güvenlik

- **`.env` dosyanı kimseyle paylaşma.** İçindeki `VOIDAI_API_KEY` canlı bir anahtardır;
  ele geçiren senin kotanı/paranı harcayabilir. Projeyi zip'leyip/yedekleyip paylaşırsan
  `.env` dosyasını çıkar. `.gitignore` zaten `.env`'i git'e göndermeyi engeller.
- Anahtarın bir şekilde sızdıysa VoidAI panelinden **iptal edip yenisini üret**.
- Telegram botunu sadece kendin kullanacaksan `.env`'de `TELEGRAM_ALLOWED_IDS`'e kendi
  Telegram ID'ni ekle; boş bırakırsan botu bulan herkes hafızana erişebilir (başlangıçta uyarı verilir).

## Kullanım

### Bağlantı testi
```bash
npm run test:api
```

### Komut satırından (CLI)
```bash
npm run cli
```
Çıkmak için `/cikis` yaz. Farklı bir oturum için: `npm run cli -- 2` (→ `history/chat-2.json`).

### Telegram'dan
1. Telegram'da [@BotFather](https://t.me/BotFather)'a `/newbot` yaz, bir token al.
2. Token'i `.env` içindeki `TELEGRAM_BOT_TOKEN`'a yapıştır.
3. Çalıştır:
```bash
npm run telegram
```
4. Botuna Telegram'dan yaz. (Sadece kendin kullanasın diye `TELEGRAM_ALLOWED_IDS`'e
   kendi Telegram ID'ni — [@userinfobot](https://t.me/userinfobot)'tan öğrenebilirsin — ekleyebilirsin.)

## Dosya yapısı

```
mirabot/
├─ persona.json          # kişilik / hitap ayarları
├─ memory.json           # KALICI hafıza (otomatik oluşur)
├─ history/
│  └─ chat-1.json        # sohbet geçmişleri (her oturum ayrı dosya)
├─ src/
│  ├─ config.js          # ayarlar (.env okur) + persona yükleme
│  ├─ memory.js          # hafıza kaydet/oku/sil + sanitizasyon
│  ├─ history.js         # sohbet geçmişi yönetimi
│  ├─ agent.js           # beyin: sistem promptu + araçlar + model döngüsü
│  ├─ datetime.js        # saat dilimi farkında tarih + Türkçe/göreli tarih çözümü
│  ├─ lock.js            # eş zamanlı yazmaları sıraya sokan kilit (kayıp veri önler)
│  ├─ fsutil.js          # atomik JSON yazma/okuma (bozulmaya dayanıklı)
│  ├─ cli.js             # terminal arayüzü
│  ├─ telegram.js        # Telegram botu
│  └─ test-api.js        # bağlantı testi
└─ .env                  # gizli ayarlar (git'e gönderilmez)
```

> Not: Kalıcı hafıza (`memory.json`) tüm kanallarda (CLI + Telegram) ortaktır.
> Kısa vadeli sohbet penceresi ise her kanal/oturum için ayrıdır (`chat-1.json`, `chat-tg-<id>.json`).

## Nasıl çalışıyor (kısaca)

Her mesajda AI'a şunlar verilir: kişilik + bugünün tarihi + tüm `memory.json` + son 25 mesaj.
AI, kalıcı bir bilgi veya bir olay sezdiğinde arka planda `remember_profile` / `remember_event`
araçlarını çağırır; bu kayıtlar `memory.json`'a yazılır. Geçmişi sorduğunda cevabı bu hafızadan
tarihiyle birlikte verir.
