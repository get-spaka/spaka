// The tour in the page (Q332, Q337, ADR 0008): the page is a native view the
// interface cannot draw over, so the editing script dims it while a step points
// elsewhere, and draws the step about the page itself, its bubble on the first
// heading or image in view, the rest dimmed around it. Next and Skip go back to
// the interface, which leads the tour.
import type { PageTour, TourAction } from "../../shared/ipc";

export const TOUR_STYLE = `
.tour-hole { position: fixed; border-radius: 8px; box-shadow: 0 0 0 200vmax rgb(0 0 0 / .4); pointer-events: none; display: none; }
.tour-catch { position: fixed; inset: 0; pointer-events: auto; display: none; }
.tour-bubble { position: fixed; display: none; width: 280px; box-sizing: border-box; padding: 12px 14px; border-radius: 10px;
  background: var(--up-surface); color: var(--up-text); border: 1px solid var(--up-border); box-shadow: 0 12px 32px rgb(0 0 0 / .25);
  pointer-events: auto; font-size: 13px; line-height: 1.4; }
.tour-bubble h3 { all: unset; display: block; font-weight: 600; margin-bottom: 4px; }
.tour-bubble p { all: unset; display: block; color: var(--up-text-2); }
.tour-bubble .row { display: flex; align-items: center; gap: 6px; margin-top: 10px; }
.tour-bubble .count { flex: 1; color: var(--up-muted); font-size: 12px; }
.tour-bubble button { all: unset; padding: 4px 10px; border-radius: 6px; cursor: default; font-weight: 500; }
.tour-bubble button.skip { color: var(--up-text-2); }
.tour-bubble button.skip:hover { background: var(--up-hover); }
.tour-bubble button.next { background: var(--up-text); color: var(--up-surface); }
.tour-bubble .arrow { position: absolute; width: 10px; height: 10px; background: var(--up-surface); transform: rotate(45deg);
  border: 1px solid var(--up-border); }
`;

/** What a bubble points at on the page: its first heading or image in view. */
function target(): Element | undefined {
  for (const el of document.body.querySelectorAll("h1, h2, h3, img")) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight) return el;
  }
  return undefined;
}

export class PageTourLayer {
  private readonly hole = document.createElement("div");
  private readonly catcher = document.createElement("div");
  private readonly bubble = document.createElement("div");
  private tour: PageTour | null = null;
  private act: (action: TourAction) => void = () => {};

  constructor(layer: HTMLElement) {
    this.hole.className = "tour-hole";
    this.catcher.className = "tour-catch";
    this.catcher.dataset.testid = "page-tour-veil";
    this.bubble.className = "tour-bubble";
    this.bubble.dataset.testid = "page-tour-bubble";
    this.bubble.setAttribute("role", "dialog");
    layer.append(this.catcher, this.hole, this.bubble);
    this.bubble.addEventListener("click", (e) => {
      const action = (e.target as Element).closest<HTMLElement>("[data-tour]")?.dataset.tour;
      if (action === "next" || action === "skip") this.act(action);
    });
    addEventListener("keydown", (e) => {
      if (this.tour && e.key === "Escape") this.act("skip");
    });
    addEventListener("resize", () => this.place());
    addEventListener("scroll", () => this.place(), true);
  }

  set(tour: PageTour | null, act: (action: TourAction) => void) {
    this.tour = tour;
    this.act = act;
    if (tour?.kind === "bubble") {
      this.bubble.innerHTML = "";
      const h = document.createElement("h3");
      h.textContent = tour.title;
      const p = document.createElement("p");
      p.textContent = tour.text;
      const row = document.createElement("div");
      row.className = "row";
      const count = document.createElement("span");
      count.className = "count";
      count.textContent = tour.count;
      const skip = document.createElement("button");
      skip.className = "skip";
      skip.dataset.tour = "skip";
      skip.dataset.testid = "page-tour-skip";
      skip.textContent = tour.skip;
      const next = document.createElement("button");
      next.className = "next";
      next.dataset.tour = "next";
      next.dataset.testid = "page-tour-next";
      next.textContent = tour.next;
      row.append(count, skip, next);
      const arrow = document.createElement("span");
      arrow.className = "arrow";
      this.bubble.append(arrow, h, p, row);
    }
    this.place();
  }

  private place() {
    const tour = this.tour;
    this.catcher.style.display = tour ? "block" : "none";
    this.bubble.style.display = tour?.kind === "bubble" ? "block" : "none";
    if (!tour) {
      this.hole.style.display = "none";
      return;
    }
    const el = tour.kind === "bubble" && tour.at === "content" ? target() : undefined;
    const r = el?.getBoundingClientRect();
    // At the top, the bubble points up at the interface's Publish button, above the page
    // (a tablet's or a phone's page is centred in its area).
    const corner = tour.kind === "bubble" && tour.at !== "content" ? tour.at : undefined;
    const up = corner && corner.x - (corner.width - innerWidth) / 2;
    // The page dimmed all over, or around what the bubble points at.
    const pad = 6;
    const hole = r
      ? { left: r.left - pad, top: Math.max(0, r.top - pad), width: r.width + 2 * pad, height: r.height + 2 * pad }
      : up !== undefined
        ? { left: up, top: -20, width: 0, height: 0 }
        : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
    Object.assign(this.hole.style, {
      display: "block",
      left: `${hole.left}px`,
      top: `${hole.top}px`,
      width: `${hole.width}px`,
      height: `${hole.height}px`,
    });
    if (tour.kind !== "bubble") return;
    const w = this.bubble.offsetWidth;
    const h = this.bubble.offsetHeight;
    const arrow = this.bubble.querySelector<HTMLElement>(".arrow")!;
    if (up !== undefined) {
      const left = Math.max(8, Math.min(up - w / 2, innerWidth - w - 8));
      Object.assign(this.bubble.style, { left: `${left}px`, top: "12px" });
      Object.assign(arrow.style, {
        display: "block",
        left: `${Math.max(12, Math.min(up - left - 5, w - 22))}px`,
        top: "-6px",
        bottom: "",
        borderRight: "none",
        borderBottom: "none",
        transform: "rotate(45deg)",
      });
      return;
    }
    if (!r) {
      Object.assign(this.bubble.style, { left: `${(innerWidth - w) / 2}px`, top: `${(innerHeight - h) / 2}px` });
      arrow.style.display = "none";
      return;
    }
    const below = hole.top + hole.height + 12 + h <= innerHeight - 8;
    const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8));
    const top = below ? hole.top + hole.height + 12 : Math.max(8, hole.top - 12 - h);
    Object.assign(this.bubble.style, { left: `${left}px`, top: `${top}px` });
    const x = Math.max(12, Math.min(r.left + r.width / 2 - left - 5, w - 22));
    Object.assign(arrow.style, {
      display: "block",
      left: `${x}px`,
      top: below ? "-6px" : "",
      bottom: below ? "" : "-6px",
      borderRight: "none",
      borderBottom: "none",
      transform: below ? "rotate(45deg)" : "rotate(225deg)",
    });
  }
}
