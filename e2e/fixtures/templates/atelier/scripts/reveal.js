// Each [data-reveal] rises into view, once.
import { animate, inView } from "motion";

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const within = (root, selector) =>
  root === document
    ? [...document.querySelectorAll(selector)]
    : [root, ...root.querySelectorAll(selector)].filter((el) => el.matches(selector));

let stops = [];

export function start(root) {
  if (reduced()) return;
  for (const el of within(root, "[data-reveal]")) {
    el.style.opacity = "0";
    el.style.transform = "translateY(32px)";
    stops.push(
      inView(el, () => {
        animate(el, { opacity: 1, y: [32, 0] }, { duration: 0.9, ease: [0.22, 1, 0.36, 1] });
      }),
    );
  }
}

export function stop() {
  for (const stop of stops) stop();
  stops = [];
}
