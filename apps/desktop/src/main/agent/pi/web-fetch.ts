// The harness's WebFetch, after the official binary's (Q433): a page read as
// Markdown, then answered by the account's small model as `prompt` asks. An
// http address goes over https; a page that sends to another site is not
// followed, the agent told where it leads; a page read in the last 15 minutes
// is not fetched again.

export type FetchedPage = { url: string; markdown: string };

const CACHE_MS = 15 * 60_000;
const cache = new Map<string, { at: number; page: FetchedPage }>();

/** The most of a page the small model reads. */
export const PAGE_LIMIT = 100_000;

/** Reads a page, or says where it sends when that is another site. */
export async function fetchPage(
  address: string,
  signal?: AbortSignal,
  get: typeof fetch = fetch,
): Promise<FetchedPage | { redirect: string }> {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    throw new Error("Give a full address, starting with https://.");
  }
  if (url.protocol === "http:") url.protocol = "https:";
  if (url.protocol !== "https:") throw new Error("Give a full address, starting with https://.");
  const cached = cache.get(url.href);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.page;
  let at = url;
  for (let hops = 0; ; hops++) {
    const response = await get(at.href, { signal, redirect: "manual", headers: { "user-agent": "Spaka" } });
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      const next = new URL(response.headers.get("location")!, at);
      if (next.host !== at.host) return { redirect: next.href };
      if (hops >= 5) throw new Error("The page sends to itself too many times.");
      at = next;
      continue;
    }
    if (!response.ok) throw new Error(`The page answered ${response.status}.`);
    const type = response.headers.get("content-type") ?? "";
    const body = await response.text();
    const page = { url: at.href, markdown: type.includes("html") ? pageMarkdown(body, at) : body };
    cache.set(url.href, { at: Date.now(), page });
    return page;
  }
}

/** Forgets the pages read: for checks. */
export function forgetPages() {
  cache.clear();
}

/** What the small model is told when it answers from a page. */
export const FETCH_INSTRUCTIONS =
  "You read a web page for another agent. Answer its request from the page's content alone, briefly, in the request's language. " +
  "Keep names, addresses, prices, dates and opening hours exactly as the page gives them, and quote at most a short phrase of its text. " +
  "When the page does not say, say so.";

/** What the agent reads back: the small model's answer, or the page itself when there is none. */
export function fetchAnswer(page: FetchedPage, answer: string | undefined): string {
  if (answer?.trim()) return `${answer.trim()}\n\n(From ${page.url})`;
  const text = page.markdown;
  return text.length > 40_000 ? `${text.slice(0, 40_000)}\n[cut]` : text;
}

/** A page as rough Markdown: its headings, links, lists and paragraphs, without scripts, styles or tags. */
export function pageMarkdown(html: string, base?: URL): string {
  const body = /<body[\s\S]*?>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim();
  const text = body
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, "")
    .replace(
      /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi,
      (_m, level, inner) => `\n\n${"#".repeat(Number(level))} ${inline(inner)}\n\n`,
    )
    .replace(/<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, inner) => {
      const label = inline(inner);
      if (!label) return "";
      let target = href;
      try {
        target = base ? new URL(href, base).href : href;
      } catch {}
      return /^(javascript|mailto|tel):/i.test(target) ? label : `[${label}](${target})`;
    })
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<(br)\s*\/?>/gi, "\n")
    .replace(
      /<\/(p|div|section|article|header|footer|main|ul|ol|table|tr|blockquote|figure|dl|dt|dd|nav|aside)>/gi,
      "\n\n",
    )
    .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, "**$2**")
    .replace(/<img\s[^>]*alt\s*=\s*["']([^"']+)["'][^>]*>/gi, " [image: $1] ")
    .replace(/<[^>]+>/g, " ");
  const decoded = entities(text)
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return title ? `# ${entities(title)}\n\n${decoded}` : decoded;
}

function inline(html: string): string {
  return entities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function entities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}
