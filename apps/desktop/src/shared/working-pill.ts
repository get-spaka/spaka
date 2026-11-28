// The "Agent working" pill's look (Q391), drawn twice: by the editor inside the
// page, and by the app over the preview's empty view before the website has a
// page (Q549). Its large shadow and fine light ring make it stand out on dark
// pages as on light ones (Q550). Where it sits and when it shows are each
// drawer's own.

/** The pill's shadow, then its ring. */
export const WORKING_PILL_SHADOW = "0 12px 40px rgb(0 0 0 / .45), 0 0 0 1px rgb(255 255 255 / .15)";

/** The rules for a pill whose root is `root`: its bars, words, Stop, and their keyframes. */
export function workingPillStyle(root: string): string {
  return `${root} { align-items: center; gap: 10px; height: 40px; padding: 0 6px 0 16px; border-radius: 999px; background: #1c1b2e;
  color: #f4f4f5; font-size: 13px; white-space: nowrap; box-shadow: ${WORKING_PILL_SHADOW}; pointer-events: auto;
  animation: spaka-rise .25s ease-out both; }
${root} b { font-weight: 600; }
${root} .sub { color: #a1a1c9; }
${root} .bars { display: flex; gap: 2px; align-items: center; height: 12px; }
${root} .bars i { display: block; width: 3px; height: 12px; border-radius: 2px; background: #b9b8ec; animation: spaka-bar .9s ease-in-out infinite; }
${root} .bars i:nth-child(2) { animation-delay: .15s; } ${root} .bars i:nth-child(3) { animation-delay: .3s; }
${root} .bars i:nth-child(4) { animation-delay: .45s; }
${root} button { all: unset; display: flex; align-items: center; gap: 5px; height: 28px; padding: 0 12px; border-radius: 999px;
  background: rgb(255 255 255 / .12); color: #fff; font-size: 12px; font-weight: 500; cursor: default; }
${root} button:hover { background: rgb(255 255 255 / .2); }
${root} button svg { width: 9px; height: 9px; }
@keyframes spaka-bar { 0%, 100% { transform: scaleY(.35); } 50% { transform: scaleY(1); } }
@keyframes spaka-rise { from { transform: translate(-50%, 16px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
@media (prefers-reduced-motion: reduce) { ${root}, ${root} .bars i { animation: none; } }`;
}
