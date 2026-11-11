// Reading the trace the runtime leaves in the page (injectTrace): where each
// element comes from, and which shared part a page-level element belongs to.

export type Origin = { file: string; line: number; at: number };

const VOID = new Set(["area", "br", "col", "embed", "hr", "img", "input", "source", "track", "wbr"]);

export function originOf(el: Element): Origin | undefined {
  const m = /^(.+):(\d+):(\d+)$/.exec(el.getAttribute("data-up-src") ?? "");
  return m ? { file: m[1]!, line: Number(m[2]), at: Number(m[3]) } : undefined;
}

/** The nearest element of the page that came from the project's templates. */
export function tracedFrom(target: EventTarget | null): HTMLElement | undefined {
  let el = target instanceof Element ? target : null;
  while (el && !el.hasAttribute("data-up-src")) el = el.parentElement;
  return el instanceof HTMLElement && el !== document.body ? el : undefined;
}

/** Where a page's sections are: its <main>, or its <body>. */
export function sectionContainer(): Element {
  return document.querySelector("main") ?? document.body;
}

/**
 * What a section is in the source: the element itself, or the include of
 * the shared part it came from, as the runtime marked it with comments.
 */
export function sectionTarget(el: Element): Origin | undefined {
  if (el.parentElement !== sectionContainer()) return undefined;
  for (let node = el.previousSibling; node; node = node.previousSibling) {
    if (node.nodeType !== Node.COMMENT_NODE) continue;
    const text = (node as Comment).data.trim();
    if (text === "/up-inc") break;
    const m = /^up-inc (.+):(\d+):\d+$/.exec(text);
    if (m) return { file: m[1]!, line: 0, at: Number(m[2]) };
  }
  return originOf(el);
}

/** The page's sections in order, each once, with an element that shows it. */
export function sectionList(): { target: Origin; el: Element }[] {
  const out: { target: Origin; el: Element }[] = [];
  for (const child of sectionContainer().children) {
    const target = sectionTarget(child);
    if (!target) continue;
    const last = out.at(-1);
    if (last && last.target.file === target.file && last.target.at === target.at) continue;
    out.push({ target, el: child });
  }
  return out;
}

/** An element's texts between its tags, as the source's are counted (textRuns in the runtime). */
export function textsOf(el: Element): { tags: string[]; texts: string[] } {
  const tags: string[] = [];
  const texts: string[] = [];
  let current = "";
  const walk = (node: Node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) current += (child as Text).data;
      else if (child instanceof Element) {
        const name = child.localName;
        texts.push(current);
        current = "";
        tags.push(name);
        walk(child);
        if (!VOID.has(name)) {
          texts.push(current);
          current = "";
          tags.push(`/${name}`);
        }
      }
    }
  };
  walk(el);
  texts.push(current);
  return { tags, texts };
}
