// Comments on the page's elements, for the agent (Q95): a numbered pin on
// each element commented on this page, a card to write in, and a bar
// floating at the bottom of the page that sends them all as one message.
// The comments are kept by the main process; this draws them.
import type { PageComment } from "../../shared/ipc";
import { en } from "../../shared/strings/en";
import { originOf } from "./trace";

const t = en.comments;

export const COMMENT_STYLE = `
.pin { position: fixed; width: 20px; height: 20px; border-radius: 10px 10px 10px 2px; background: #4f46e5; color: #fff;
  display: grid; place-items: center; font-size: 11px; font-weight: 600; pointer-events: auto; cursor: default;
  box-shadow: 0 1px 4px rgb(0 0 0 / .25); }
.card { position: fixed; width: 260px; display: none; flex-direction: column; gap: 6px; padding: 8px; background: var(--spaka-surface);
  border: 1px solid var(--spaka-border); border-radius: 10px; box-shadow: 0 6px 20px rgb(0 0 0 / .15); pointer-events: auto; }
.card .about { color: var(--spaka-muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card textarea { all: unset; box-sizing: border-box; width: 100%; min-height: 56px; padding: 6px; border: 1px solid var(--spaka-input);
  border-radius: 6px; font-size: 12px; white-space: pre-wrap; }
.card .row, .sendbar { display: flex; gap: 6px; align-items: center; }
.card .row { justify-content: flex-end; }
.card button, .sendbar button { all: unset; padding: 4px 9px; border-radius: 6px; background: var(--spaka-hover); color: var(--spaka-text-2); }
.card button.primary, .sendbar button.primary { background: #4f46e5; color: #fff; }
.card button.danger { margin-right: auto; color: var(--spaka-danger); }
.sendbar button[disabled] { opacity: .5; }
.sendbar { position: fixed; left: 50%; bottom: 14px; transform: translateX(-50%); display: none; padding: 6px 6px 6px 12px;
  background: #18181b; color: #fafafa; border-radius: 12px; box-shadow: 0 6px 20px rgb(0 0 0 / .25); pointer-events: auto; white-space: nowrap; }
.sendbar button { background: #3f3f46; color: #fafafa; }
`;

/** Below this width, the send bar moves to the preview's own toolbar (Q95). */
export const NARROW = 480;

export type CommentsBridge = {
  save(comment: Omit<PageComment, "id"> & { id?: string }): Promise<PageComment[]>;
  remove(id: string): Promise<PageComment[]>;
  send(): Promise<void>;
  discard(): Promise<void>;
};

export class CommentLayer {
  private comments: PageComment[] = [];
  private readonly pins: HTMLElement;
  private readonly card: HTMLElement;
  private readonly bar: HTMLElement;
  private open: { comment?: PageComment; el: HTMLElement } | undefined;
  private paused = false;

  constructor(
    layer: HTMLElement,
    private readonly bridge: CommentsBridge,
    private readonly toast: (text: string) => void,
  ) {
    layer.insertAdjacentHTML(
      "beforeend",
      `<div class="pins"></div>
      <div class="card" data-testid="comment-card"><div class="about"></div><textarea></textarea>
        <div class="row"><button class="danger" data-act="remove" data-tip="${t.removeTip}">${t.remove}</button><button data-act="close" data-tip="${t.cancelTip}">${t.cancel}</button><button class="primary" data-act="save" data-tip="${t.saveTip}">${t.save}</button></div></div>
      <div class="sendbar" data-testid="comment-bar"><span class="count"></span><button data-act="discard" data-tip="${t.discardTip}">${t.discard}</button><button class="primary" data-act="send">${t.send}</button></div>`,
    );
    this.pins = layer.querySelector(".pins")!;
    this.card = layer.querySelector(".card")!;
    this.bar = layer.querySelector(".sendbar")!;
    this.card.addEventListener("click", (e) => {
      const act = (e.target as HTMLElement).dataset.act;
      if (act === "save") void this.save();
      if (act === "close") this.close();
      if (act === "remove") void this.remove();
    });
    this.card.querySelector("textarea")!.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void this.save();
      if (e.key === "Escape") this.close();
    });
    this.bar.addEventListener("click", (e) => {
      const act = (e.target as HTMLElement).dataset.act;
      if (act === "send") void this.bridge.send().catch((error) => this.toast(String(error?.message ?? error)));
      if (act === "discard") void this.bridge.discard();
    });
  }

  set(comments: PageComment[]) {
    this.comments = comments;
    if (this.open?.comment && !comments.some((c) => c.id === this.open?.comment?.id)) this.close();
    this.drawPins();
    this.place();
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.drawBar();
  }

  /** Opens the card on an element: its comment if it has one on this page, else a new one. */
  openOn(el: HTMLElement) {
    const origin = originOf(el);
    if (!origin) return;
    const comment = this.here().find((c) => c.file === origin.file && c.at === origin.at);
    this.open = { comment, el };
    this.card.querySelector(".about")!.textContent = describe(el);
    const area = this.card.querySelector("textarea")!;
    area.value = comment?.text ?? "";
    area.placeholder = t.placeholder;
    (this.card.querySelector('[data-act="remove"]') as HTMLElement).style.display = comment ? "" : "none";
    this.card.style.display = "flex";
    this.place();
    area.focus();
  }

  close() {
    this.open = undefined;
    this.card.style.display = "none";
  }

  get isOpen() {
    return !!this.open;
  }

  /** Puts the pins, the card and the bar where the elements are now. */
  place() {
    for (const pin of this.pins.children as HTMLCollectionOf<HTMLElement>) {
      const el = find(pin.dataset.file!, Number(pin.dataset.at));
      const r = el?.getBoundingClientRect();
      pin.style.display = r && r.bottom > 0 && r.top < innerHeight ? "grid" : "none";
      if (r)
        Object.assign(pin.style, {
          left: `${Math.min(r.right - 10, innerWidth - 24)}px`,
          top: `${Math.max(2, r.top - 10)}px`,
        });
    }
    if (this.open) {
      if (!this.open.el.isConnected) {
        const again = this.open.comment && find(this.open.comment.file, this.open.comment.at);
        if (again) this.open.el = again;
      }
      const r = this.open.el.getBoundingClientRect();
      const height = this.card.offsetHeight || 130;
      const top = r.bottom + 8 + height < innerHeight ? r.bottom + 8 : Math.max(4, r.top - height - 8);
      Object.assign(this.card.style, {
        left: `${Math.max(4, Math.min(r.left, innerWidth - 268))}px`,
        top: `${top}px`,
      });
    }
    this.drawBar();
  }

  private here(): PageComment[] {
    return this.comments.filter((c) => c.route === location.pathname);
  }

  private drawPins() {
    this.pins.innerHTML = "";
    this.comments.forEach((c, i) => {
      if (c.route !== location.pathname) return;
      const pin = document.createElement("div");
      pin.className = "pin";
      pin.textContent = String(i + 1);
      pin.dataset.tip = c.text;
      pin.dataset.file = c.file;
      pin.dataset.at = String(c.at);
      pin.dataset.testid = "comment-pin";
      pin.addEventListener("click", () => {
        const el = find(c.file, c.at);
        if (el) this.openOn(el);
      });
      this.pins.append(pin);
    });
  }

  private drawBar() {
    const n = this.comments.length;
    this.bar.style.display = n > 0 && innerWidth >= NARROW ? "flex" : "none";
    this.bar.querySelector(".count")!.textContent = t.count(n);
    const send = this.bar.querySelector('[data-act="send"]') as HTMLButtonElement;
    send.disabled = this.paused;
    send.dataset.tip = this.paused ? t.waitForAgent : t.sendTitle;
  }

  private async save() {
    const open = this.open;
    if (!open) return;
    const origin = originOf(open.el);
    if (!origin) return;
    const text = this.card.querySelector("textarea")!.value;
    await this.bridge.save({
      id: open.comment?.id,
      route: location.pathname,
      file: origin.file,
      line: origin.line,
      at: origin.at,
      label: describe(open.el),
      snippet: snippet(open.el),
      text,
    });
    this.close();
  }

  private async remove() {
    const id = this.open?.comment?.id;
    if (id) await this.bridge.remove(id);
    this.close();
  }
}

function find(file: string, at: number): HTMLElement | undefined {
  return (
    document.querySelector<HTMLElement>(`[data-spaka-src^="${CSS.escape(file)}:"][data-spaka-src$=":${at}"]`) ??
    undefined
  );
}

const KINDS: Record<string, string> = {
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  h5: "heading",
  h6: "heading",
  p: "paragraph",
  a: "link",
  button: "button",
  img: "image",
  section: "section",
  header: "header",
  footer: "footer",
  nav: "menu",
  ul: "list",
  ol: "list",
  li: "list item",
  form: "form",
};

/** "heading “Chez Margot”": what the element is, and the start of its text. */
export function describe(el: Element): string {
  const kind = KINDS[el.localName] ?? el.localName;
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  const alt = el.getAttribute("alt");
  const words = text || alt || "";
  return words ? `${kind} “${words.length > 40 ? `${words.slice(0, 40)}…` : words}”` : kind;
}

/** The start of the element's HTML, without Spaka's own attributes. */
export function snippet(el: Element): string {
  const html = el.outerHTML
    .replace(/\s(data-spaka-[\w-]+|contenteditable|spellcheck)="[^"]*"/g, "")
    .replace(/\s+/g, " ");
  return html.length > 300 ? `${html.slice(0, 300)}…` : html;
}
