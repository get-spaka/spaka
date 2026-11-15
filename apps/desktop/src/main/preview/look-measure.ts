// The problems Upstart measures when the agent looks (Q318), in text beside
// the picture, each with its element's file and line: the page wider than
// the screen, text cut off, elements on the screen still hidden once the
// page has settled, images that did not load, links to an address with no
// page. Measured on the screen looked at only, once the page has settled;
// what the template makes hidden on purpose (a menu closed, a hover effect,
// a text for screen readers) is left out.
import { NAME_OF } from "./look-steps";

/** What the page measured: its problems, and the website's addresses its links lead to, for Upstart to check. */
export type Measured = { problems: string[]; links: { path: string; name: string }[] };

/** At most this many problems of each kind. */
const EACH = 4;

/**
 * In the page: its problems on a screen `width` px wide (Measured). The
 * screen's own width, not the page's: on a phone, a page wider than the
 * screen widens its layout to its content.
 */
export const measure = (width: number) => `(() => {
  ${NAME_OF}
  const W = ${width}, H = window.visualViewport ? visualViewport.height : innerHeight;
  const problems = [];
  const all = [...document.body.querySelectorAll("*")];
  const inView = (r) => r.bottom > 0 && r.top < H && r.right > 0 && r.left < W && r.width > 2 && r.height > 2;
  // What is hidden on purpose: closed, for screen readers only, inert, or shown only on hover, focus or when open.
  const VARIANT = /(^|\\s)([\\w-]+:)*(hover|focus|focus-within|focus-visible|active|open|group-[\\w-]+|peer-[\\w-]+|aria-[\\w-]+|data-[\\w-]+|has-[\\w[\\]=-]+):/;
  const onPurpose = (el) => {
    for (let e = el, depth = 0; e && e !== document.body; e = e.parentElement, depth++) {
      if (e.hidden || e.inert || e.getAttribute("aria-hidden") === "true") return true;
      if (e.matches("details:not([open]) > :not(summary), dialog:not([open]), [popover]:not(:popover-open), template, .sr-only, .dropdown-content, .tooltip")) return true;
      if (depth < 4 && VARIANT.test(e.getAttribute("class") || "")) return true;
    }
    return false;
  };
  const outermost = (list) => list.filter((el) => !list.some((other) => other !== el && other.contains(el)));

  // The page wider than the screen: it scrolls sideways.
  const wide = document.documentElement.scrollWidth;
  if (wide > W + 1) {
    const out = outermost(all.filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(el).position === "fixed") return false;
      if (!(r.right + scrollX > W + 1 || r.left + scrollX < -1)) return false;
      // Inside a box that scrolls or clips sideways, it does not widen the page.
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement)
        if (getComputedStyle(p).overflowX !== "visible") return false;
      return true;
    }));
    const named = out.slice(0, ${EACH}).map((el) => { const r = el.getBoundingClientRect(); return nameOf(el) + " runs from " + Math.round(r.left + scrollX) + " to " + Math.round(r.right + scrollX) + " px"; });
    problems.push("The page is wider than the screen (" + wide + " px on a " + W + " px screen), so it scrolls sideways" + (named.length ? ": " + named.join("; ") : "") + ".");
  }

  const seen = all.filter((el) => inView(el.getBoundingClientRect()));

  // Text cut off: a box that clips its own text.
  const cut = [];
  for (const el of seen) {
    const s = getComputedStyle(el);
    const clipsX = s.overflowX === "hidden" || s.overflowX === "clip";
    const clipsY = s.overflowY === "hidden" || s.overflowY === "clip";
    if (!clipsX && !clipsY) continue;
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    if (s.textOverflow === "ellipsis" || (s.webkitLineClamp && s.webkitLineClamp !== "none") || onPurpose(el)) continue;
    const overX = clipsX && el.scrollWidth > el.clientWidth + 1;
    const overY = clipsY && el.scrollHeight > el.clientHeight + 1;
    if (!overX && !overY) continue;
    cut.push(nameOf(el) + (overY ? " needs " + el.scrollHeight + " px of height and has " + el.clientHeight : " needs " + el.scrollWidth + " px of width and has " + el.clientWidth));
    if (cut.length >= ${EACH}) break;
  }
  if (cut.length) problems.push("Text cut off: " + cut.join("; ") + ".");

  // Elements on the screen that stay hidden once the page has settled. What hides
  // one (its own opacity or an ancestor's) must be half on the screen at least:
  // a reveal waits for an element coming in at the bottom to be far enough in.
  const hidden = outermost(seen.filter((el) => {
    const visual = el.matches("img, svg, video, picture, canvas") || [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!visual) return false;
    let opacity = 1, faintest = el, least = 1, hider = null;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const s = getComputedStyle(e), own = Number(s.opacity);
      opacity *= own;
      if (own < least) { least = own; faintest = e; }
      if (s.visibility === "hidden" && (!e.parentElement || getComputedStyle(e.parentElement).visibility !== "hidden")) hider = e;
    }
    if (getComputedStyle(el).visibility === "hidden") hider = hider || el;
    else if (opacity < 0.05) hider = faintest;
    else return false;
    const r = hider.getBoundingClientRect();
    const onScreen = Math.min(r.bottom, H) - Math.max(r.top, 0);
    if (onScreen < Math.min(r.height, H) / 2) return false;
    return !onPurpose(el);
  }));
  if (hidden.length)
    problems.push("Still hidden on the screen once the page settled (opacity 0 or visibility: hidden): " + hidden.slice(0, ${EACH}).map(nameOf).join("; ") + (hidden.length > ${EACH} ? "; and " + (hidden.length - ${EACH}) + " more" : "") + ".");

  // Images that did not load.
  const broken = seen.filter((el) => el instanceof HTMLImageElement && el.complete && el.naturalWidth === 0 && el.getAttribute("src"));
  if (broken.length)
    problems.push("Images that did not load: " + broken.slice(0, ${EACH}).map((img) => nameOf(img) + " from " + img.getAttribute("src")).join("; ") + ".");

  // The website's addresses the page's links lead to, for Upstart to check.
  const links = [];
  const paths = new Set();
  for (const a of document.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href");
    if (!href || href.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) continue;
    let url;
    try { url = new URL(href, location.href); } catch { continue; }
    if (url.origin !== location.origin || /\\.[a-z0-9]{2,5}$/i.test(url.pathname) || /^\\/(_data|__up|media)\\//.test(url.pathname)) continue;
    if (paths.has(url.pathname)) continue;
    paths.add(url.pathname);
    links.push({ path: url.pathname, name: nameOf(a) });
  }
  return { problems, links };
})()`;

/** The problems, with the links to an address no page has, which `resolves` says. */
export function problemsOf(measured: Measured | undefined, resolves: (path: string) => boolean): string[] {
  if (!measured) return [];
  const dead = measured.links.filter((l) => !resolves(l.path));
  return [
    ...measured.problems,
    ...(dead.length
      ? [
          `Links to an address no page has: ${dead
            .slice(0, EACH)
            .map((l) => `${l.path} (${l.name})`)
            .join("; ")}${dead.length > EACH ? `; and ${dead.length - EACH} more` : ""}.`,
        ]
      : []),
  ];
}
