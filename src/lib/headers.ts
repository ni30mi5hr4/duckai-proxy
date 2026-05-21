const BROWSER_OS = [
  "Windows NT 10.0; Win64; x64",
  "Windows NT 10.0; WOW64",
  "Macintosh; Intel Mac OS X 10_15_7",
  "Macintosh; Intel Mac OS X 13_0",
  "X11; Linux x86_64",
  "X11; Ubuntu; Linux x86_64",
  "Android 10; Mobile",
  "Android 12; Mobile",
  "Android 13; Mobile",
  "iPhone; CPU iPhone OS 16_0 like Mac OS X",
  "iPad; CPU OS 16_0 like Mac OS X",
];

const LANGUAGES = [
  "en-US", "en-GB", "zh-CN", "es-ES", "fr-FR", "de-DE",
  "ja-JP", "ko-KR", "ru-RU", "pt-BR", "ar-SA", "hi-IN",
  "it-IT", "nl-NL", "sv-SE", "pl-PL", "tr-TR", "vi-VN",
  "id-ID", "th-TH", "uk-UA", "cs-CZ", "el-GR", "hu-HU",
  "ro-RO", "da-DK", "fi-FI", "no-NO",
];

const SEC_FETCH_DEST_OPTIONS = [
  "empty", "document", "script", "style", "image", "worker",
];

const SEC_FETCH_MODE_OPTIONS = [
  "cors", "navigate", "no-cors", "same-origin",
];

const SEC_FETCH_SITE_OPTIONS = [
  "same-origin", "same-site", "cross-site", "none",
];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function chance(p: number): boolean {
  return Math.random() < p;
}

function randomUserAgent(): string {
  const os = rand(BROWSER_OS);
  const chromeVersion = Math.floor(Math.random() * 40) + 100;
  const webkitVersion = Math.floor(Math.random() * 60) + 534;

  const type = Math.random();

  if (type < 0.5) {
    return `Mozilla/5.0 (${os}) AppleWebKit/${webkitVersion}.36 (KHTML, like Gecko) Chrome/${chromeVersion}.0.0.0 Safari/${webkitVersion}.36`;
  } else if (type < 0.75) {
    const ffVersion = Math.floor(Math.random() * 50) + 100;
    const geckoDate = 20100101 + Math.floor(Math.random() * 50000000);
    return `Mozilla/5.0 (${os}; rv:${ffVersion}.0) Gecko/${geckoDate} Firefox/${ffVersion}.0`;
  } else {
    const edgeVersion = Math.floor(Math.random() * 40) + 100;
    return `Mozilla/5.0 (${os}) AppleWebKit/${webkitVersion}.36 (KHTML, like Gecko) Chrome/${edgeVersion}.0.0.0 Safari/${webkitVersion}.36 Edg/${edgeVersion}.0.0.0`;
  }
}

function randomAcceptLanguage(): string {
  const langs = [...LANGUAGES].sort(() => Math.random() - 0.5).slice(0, 4);
  return langs
    .map((lang, i) =>
      i === 0 ? lang : `${lang};q=${(1 - i * 0.1).toFixed(1)}`
    )
    .join(",");
}

export function generateRandomHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};

  headers["User-Agent"] = randomUserAgent();
  headers["Accept-Language"] = randomAcceptLanguage();
  headers["Accept-Encoding"] = "gzip, deflate, br, zstd";

  if (chance(0.6)) headers["DNT"] = chance(0.5) ? "1" : "0";
  if (chance(0.4)) headers["Sec-GPC"] = "1";
  if (chance(0.7)) headers["Connection"] = "keep-alive";
  if (chance(0.3)) headers["Cache-Control"] = chance(0.5) ? "no-cache" : "max-age=0";
  if (chance(0.2)) headers["Pragma"] = "no-cache";

  if (chance(0.8)) {
    headers["Sec-Fetch-Dest"] = rand(SEC_FETCH_DEST_OPTIONS);
  }
  if (chance(0.8)) {
    headers["Sec-Fetch-Mode"] = rand(SEC_FETCH_MODE_OPTIONS);
  }
  if (chance(0.8)) {
    headers["Sec-Fetch-Site"] = rand(SEC_FETCH_SITE_OPTIONS);
  }

  if (chance(0.7)) {
    const chromeV = Math.floor(Math.random() * 40) + 100;
    headers["Sec-Ch-UA"] = `"Not:A-Brand";v="99", "Chromium";v="${chromeV}"`;
    if (chance(0.5)) headers["Sec-Ch-UA-Mobile"] = chance(0.3) ? "?1" : "?0";
    if (chance(0.5)) {
      headers["Sec-Ch-UA-Platform"] = rand(['"Windows"', '"macOS"', '"Linux"', '"Android"', '"iOS"']);
    }
  }

  if (chance(0.3)) {
    const u = Math.floor(Math.random() * 5);
    headers["Priority"] = chance(0.5) ? `u=${u}` : `u=${u}, i`;
  }

  if (chance(0.05)) headers["Referer"] = "https://duckduckgo.com/";
  if (chance(0.05)) headers["Origin"] = "https://duckduckgo.com";

  return headers;
}

export function randomDcs(): string {
  return "1";
}

export function randomDcm(): string {
  return Math.floor(Math.random() * 9).toString();
}

export function buildCookie(): string {
  return `dcs=${randomDcs()}; dcm=${randomDcm()}`;
}
