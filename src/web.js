// Anahtar gerektirmeyen web arama (DuckDuckGo lite/html), kripto fiyat (CoinGecko)
// ve doviz kuru (Frankfurter/ER-API). Istege bagli: BRAVE_API_KEY ile Brave Search.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const CTRL = new RegExp("[\\x00-\\x1f\\x7f]", "g");

function stripTags(s) {
  return String(s)
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(CTRL, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Modele gidecek serbest web metnini kontrol karakterlerinden arindirip kirpar. */
function clip(s, max = 300) {
  return stripTags(s).slice(0, max);
}

/** DDG yonlendirme linkinden gercek URL'yi cikarir; yalniz http(s) kabul eder. */
function realUrl(href) {
  let u = href;
  const m = /[?&]uddg=([^&]+)/.exec(href);
  if (m) {
    try {
      u = decodeURIComponent(m[1]);
    } catch {
      u = m[1];
    }
  } else if (u.startsWith("//")) {
    u = "https:" + u;
  }
  try {
    const p = new URL(u);
    return p.protocol === "http:" || p.protocol === "https:" ? u : "";
  } catch {
    return "";
  }
}

function headers() {
  return { "User-Agent": UA, "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8" };
}

/** Brave Search (anahtar varsa). */
async function braveSearch(q, limit) {
  const key = process.env.BRAVE_API_KEY;
  if (!key) return null;
  const r = await fetch(
    "https://api.search.brave.com/res/v1/web/search?q=" + encodeURIComponent(q),
    { headers: { Accept: "application/json", "X-Subscription-Token": key }, signal: AbortSignal.timeout(12000) }
  );
  if (!r.ok) return null;
  const j = await r.json();
  const items = j?.web?.results || [];
  if (!items.length) return null;
  return items.slice(0, limit).map((x) => ({
    title: clip(x.title || "", 200),
    url: realUrl(x.url || ""),
    snippet: clip(x.description || ""),
  }));
}

/** DuckDuckGo lite (anahtarsiz, daha az engellenir). */
async function ddgLite(q, limit) {
  const r = await fetch("https://lite.duckduckgo.com/lite/?q=" + encodeURIComponent(q), {
    headers: headers(),
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) return null;
  const html = await r.text();
  const links = [...html.matchAll(/href="([^"]+)"[^>]*class=['"]result-link['"][^>]*>(.*?)<\/a>/gs)];
  const snippets = [...html.matchAll(/class=['"]result-snippet['"][^>]*>(.*?)<\/td>/gs)].map((x) =>
    clip(x[1])
  );
  const out = [];
  for (let i = 0; i < links.length && out.length < limit; i++) {
    const title = clip(links[i][2], 200);
    if (!title) continue;
    out.push({ title, url: realUrl(links[i][1]), snippet: snippets[i] || "" });
  }
  return out.length ? out : null;
}

/** DuckDuckGo html (yedek). */
async function ddgHtml(q, limit) {
  const r = await fetch("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q), {
    headers: headers(),
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) return null;
  const html = await r.text();
  const links = [...html.matchAll(/class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gs)];
  const snippets = [...html.matchAll(/class="result__snippet"[^>]*>(.*?)<\/a>/gs)].map((x) =>
    clip(x[1])
  );
  const out = [];
  for (let i = 0; i < links.length && out.length < limit; i++) {
    const title = clip(links[i][2], 200);
    if (!title) continue;
    out.push({ title, url: realUrl(links[i][1]), snippet: snippets[i] || "" });
  }
  return out.length ? out : null;
}

/**
 * Web araması. Sirasiyla: Brave (anahtar varsa) -> DDG lite -> DDG html dener.
 * @returns {Promise<{ok:boolean, query?:string, results?:Array, error?:string}>}
 */
export async function webSearch(query, limit = 5) {
  const q = String(query || "").trim();
  if (!q) return { ok: false, error: "bos sorgu" };
  const backends = [braveSearch, ddgLite, ddgHtml];
  for (const fn of backends) {
    try {
      const results = await fn(q, limit);
      if (results && results.length) return { ok: true, query: q, results };
    } catch {
      /* sonraki yedege gec */
    }
  }
  return { ok: false, error: "arama su an yapilamadi (kaynaklar yanit vermedi)", query: q };
}

// Yaygin kripto sembolleri -> CoinGecko id eslemesi (hizli yol).
const COIN_MAP = {
  btc: "bitcoin", bitcoin: "bitcoin",
  eth: "ethereum", ethereum: "ethereum",
  bnb: "binancecoin", sol: "solana", xrp: "ripple",
  ada: "cardano", doge: "dogecoin", trx: "tron",
  avax: "avalanche-2", ltc: "litecoin", dot: "polkadot",
  matic: "matic-network", shib: "shiba-inu", ton: "the-open-network",
  usdt: "tether", usdc: "usd-coin", link: "chainlink",
  atom: "cosmos", xlm: "stellar", etc: "ethereum-classic",
};

/**
 * CoinGecko'dan kripto fiyatini ceker (varsayilan TRY).
 * @returns {Promise<{ok:boolean, id?:string, currency?:string, price?:number, usd?:number, error?:string}>}
 */
export async function cryptoPrice(symbol, currency = "try") {
  const raw = String(symbol || "").trim().toLowerCase();
  const s = raw.replace(/[^a-z0-9-]/g, "");
  if (!s) return { ok: false, error: "kripto sembolu gerekli" };
  const cur = String(currency || "try").trim().toLowerCase().replace(/[^a-z]/g, "") || "try";

  try {
    let id = COIN_MAP[s] || null;
    if (!id) {
      const sr = await fetch("https://api.coingecko.com/api/v3/search?query=" + encodeURIComponent(s), {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(10000),
      });
      if (!sr.ok) return { ok: false, error: `kripto arama hatasi: HTTP ${sr.status}` };
      const sj = await sr.json();
      const coins = sj?.coins || [];
      // Tam sembol eslesmesini oncele (populerlik siralamasi yanlis coin secebilir).
      const exact = coins.find((c) => String(c.symbol).toLowerCase() === s);
      id = (exact || coins[0])?.id || null;
      if (!id) return { ok: false, error: `kripto bulunamadi: ${symbol}` };
    }

    const r = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=${encodeURIComponent(cur)},usd`,
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10000) }
    );
    if (!r.ok) return { ok: false, error: `fiyat hatasi: HTTP ${r.status}` };
    const j = await r.json();
    const data = j[id];
    if (!data) return { ok: false, error: `fiyat bulunamadi: ${symbol}` };

    return { ok: true, id, currency: cur, price: data[cur] ?? null, usd: data.usd ?? null };
  } catch (e) {
    return { ok: false, error: `fiyat alinamadi: ${e?.message || e}` };
  }
}

/**
 * Doviz kuru (varsayilan USD -> TRY). Frankfurter (ECB) once, ER-API yedek.
 * @returns {Promise<{ok:boolean, from?:string, to?:string, rate?:number, date?:string, error?:string}>}
 */
export async function exchangeRate(from = "USD", to = "TRY") {
  const f = String(from || "USD").trim().toUpperCase().replace(/[^A-Z]/g, "") || "USD";
  const t = String(to || "TRY").trim().toUpperCase().replace(/[^A-Z]/g, "") || "TRY";

  try {
    const r = await fetch(`https://api.frankfurter.app/latest?from=${f}&to=${t}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (r.ok) {
      const j = await r.json();
      if (j?.rates?.[t] != null) return { ok: true, from: f, to: t, rate: j.rates[t], date: j.date };
    }
  } catch {
    /* yedege gec */
  }

  try {
    const r = await fetch(`https://open.er-api.com/v6/latest/${f}`, { signal: AbortSignal.timeout(10000) });
    if (r.ok) {
      const j = await r.json();
      if (j?.rates?.[t] != null) {
        // Tarihi Frankfurter ile ayni formata (YYYY-MM-DD) normalize et.
        const d = new Date(j.time_last_update_utc);
        const date = isNaN(d.getTime()) ? j.time_last_update_utc : d.toISOString().slice(0, 10);
        return { ok: true, from: f, to: t, rate: j.rates[t], date };
      }
    }
  } catch {
    /* dusus */
  }

  return { ok: false, error: `kur bulunamadi: ${f}/${t}` };
}
