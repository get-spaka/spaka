// The editor's own tooltip (Q329), in its shadow root: the page is a native view
// the interface cannot draw over, so the bar's buttons show theirs here, like
// the interface's (renderer/components/ui/tip.tsx): after 300 ms, at once from
// one button to the next, in the overlays' colors. An element says its text
// in `data-tip`.

export const TIP_STYLE = `
.tip { position: fixed; display: none; max-width: 256px; padding: 4px 8px; border-radius: 6px; background: var(--spaka-text);
  color: var(--spaka-surface); font-size: 12px; line-height: 1.3; box-shadow: 0 4px 12px rgb(0 0 0 / .15); pointer-events: none; width: max-content; overflow-wrap: break-word; }
`;

const DELAY = 300;

export function attachTips(root: ShadowRoot, layer: HTMLElement): void {
  const tip = document.createElement("div");
  tip.className = "tip";
  tip.setAttribute("role", "tooltip");
  tip.dataset.testid = "editor-tip";
  layer.append(tip);
  let shown: HTMLElement | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let hiddenAt = 0;

  const show = (el: HTMLElement) => {
    const text = el.dataset.tip;
    if (!text || !el.isConnected) return;
    shown = el;
    tip.textContent = text;
    tip.style.display = "block";
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const below = r.bottom + 6 + h <= innerHeight - 4;
    tip.style.left = `${Math.max(4, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 4))}px`;
    tip.style.top = `${below ? r.bottom + 6 : r.top - 6 - h}px`;
  };
  const hide = () => {
    clearTimeout(timer);
    if (shown) hiddenAt = Date.now();
    shown = undefined;
    tip.style.display = "none";
  };

  // Disabled buttons get pointer events in Chromium too: the tip still says what they are for.
  root.addEventListener("pointerover", (event) => {
    const el = (event.target as Element | null)?.closest?.<HTMLElement>("[data-tip]");
    if (el === shown) return;
    hide();
    if (!el) return;
    const quick = Date.now() - hiddenAt < DELAY;
    if (quick) show(el);
    else timer = setTimeout(() => show(el), DELAY);
  });
  root.addEventListener("pointerout", (event) => {
    const to = ((event as PointerEvent).relatedTarget as Element | null)?.closest?.("[data-tip]");
    if (!to || to !== shown) hide();
  });
  root.addEventListener("pointerdown", hide, true);
  addEventListener("scroll", hide, true);
}
