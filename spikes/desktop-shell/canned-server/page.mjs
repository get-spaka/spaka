// The canned page: a realistic launch page written the way an Upstart project
// would be (Tailwind 4, daisyUI 5 themed through CSS variables, htmx 4). It
// stands in for spike 1's output. The server sends `head`, then each piece a
// few lines at a time, then `tail`.

export const head = `<!doctype html>
<html lang="en" data-theme="upstart">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fernweh — trip planning without the tabs</title>
<meta name="description" content="Fernweh turns a messy list of places into a day-by-day trip plan.">
<link rel="stylesheet" href="/vendor/daisyui.css">
<script src="/vendor/tailwind.js"></script>
<script src="/vendor/htmx.js"></script>
<style>
  /* The project's theme: daisyUI's variables are the theme's values. */
  [data-theme="upstart"] {
    color-scheme: light;
    --color-base-100: oklch(99% 0.005 95);
    --color-base-200: oklch(96% 0.012 95);
    --color-base-300: oklch(91% 0.02 95);
    --color-base-content: oklch(24% 0.03 265);
    --color-primary: oklch(55% 0.19 255);
    --color-primary-content: oklch(98% 0.01 255);
    --color-secondary: oklch(70% 0.16 45);
    --color-secondary-content: oklch(20% 0.04 45);
    --color-accent: oklch(72% 0.15 165);
    --color-accent-content: oklch(20% 0.04 165);
    --color-neutral: oklch(27% 0.03 265);
    --color-neutral-content: oklch(96% 0.01 265);
    --radius-box: 1rem;
    --radius-field: 0.6rem;
    --radius-selector: 2rem;
  }
</style>
<script>
  // The page's own script. It stands in for whatever a project ships, and
  // gives the spike three things to probe isolation with.
  window.__pageSecret = "set-by-the-page";
  Object.defineProperty(Array.prototype, "__pagePatched", { value: true, enumerable: false });
  window.addEventListener("load", function () {
    var el = document.getElementById("page-probe");
    if (el) el.textContent = "page script sees the editing script's global: " + (typeof window.__upstartEditor !== "undefined");
  });
</script>
</head>
<body class="bg-base-100 text-base-content antialiased">
<header class="navbar sticky top-0 z-10 border-b border-base-300 bg-base-100/90 px-6 backdrop-blur">
  <div class="flex-1">
    <a class="text-xl font-bold tracking-tight" href="/">Fernweh</a>
  </div>
  <nav class="hidden gap-1 md:flex">
    <a class="btn btn-ghost btn-sm" href="#features">Features</a>
    <a class="btn btn-ghost btn-sm" href="#pricing">Pricing</a>
    <a class="btn btn-ghost btn-sm" href="#voices">Voices</a>
  </nav>
  <a class="btn btn-primary btn-sm ml-3" href="#join">Get early access</a>
</header>
<main>
`;

export const pieces = [
  {
    id: "hero",
    html: `<section data-piece="hero" class="hero bg-base-200 py-20">
  <div class="hero-content max-w-5xl flex-col gap-10 lg:flex-row">
    <div class="max-w-xl">
      <span class="badge badge-accent badge-outline mb-4">New — offline maps</span>
      <h1 class="text-5xl font-extrabold leading-tight tracking-tight">Plan the trip.<br>Close the forty tabs.</h1>
      <p class="py-6 text-lg opacity-80">Fernweh turns a messy list of places into a day-by-day plan with walking times, opening hours and a map that works without signal.</p>
      <div class="flex flex-wrap gap-3">
        <a class="btn btn-primary btn-lg" href="#join">Start a plan</a>
        <a class="btn btn-ghost btn-lg" href="#features">See how it works</a>
      </div>
      <p class="mt-4 text-sm opacity-60">Free for one trip. No card needed.</p>
    </div>
    <img class="w-full max-w-sm rounded-box shadow-2xl" src="/img/hero.svg" alt="A map with a route drawn between three pins" width="480" height="360">
  </div>
</section>
`,
  },
  {
    id: "features",
    html: `<section data-piece="features" id="features" class="mx-auto max-w-5xl px-6 py-20">
  <h2 class="text-center text-3xl font-bold">Everything a trip needs, nothing it doesn't</h2>
  <p class="mx-auto mt-3 max-w-2xl text-center opacity-70">Paste links, drop pins, forward a booking e-mail. Fernweh does the sorting.</p>
  <div class="mt-12 grid gap-6 md:grid-cols-3">
    <article class="card border border-base-300 bg-base-100">
      <div class="card-body">
        <div class="mb-2 grid size-12 place-items-center rounded-field bg-primary/10 text-2xl">🗺️</div>
        <h3 class="card-title">Days that make sense</h3>
        <p class="opacity-70">Places are grouped by neighbourhood and ordered by opening hours, so you never cross town twice.</p>
      </div>
    </article>
    <article class="card border border-base-300 bg-base-100">
      <div class="card-body">
        <div class="mb-2 grid size-12 place-items-center rounded-field bg-secondary/20 text-2xl">📶</div>
        <h3 class="card-title">Works without signal</h3>
        <p class="opacity-70">Maps, tickets and notes are kept on your phone. The mountain pass has no bars; your plan does not care.</p>
      </div>
    </article>
    <article class="card border border-base-300 bg-base-100">
      <div class="card-body">
        <div class="mb-2 grid size-12 place-items-center rounded-field bg-accent/20 text-2xl">👥</div>
        <h3 class="card-title">One plan, everyone in</h3>
        <p class="opacity-70">Share a link. Friends vote on places, and the plan rearranges itself around what the group wants.</p>
      </div>
    </article>
  </div>
</section>
`,
  },
  {
    id: "pricing",
    html: `<section data-piece="pricing" id="pricing" class="bg-base-200 py-20">
  <div class="mx-auto max-w-5xl px-6">
    <h2 class="text-center text-3xl font-bold">Simple pricing</h2>
    <div class="mt-12 grid gap-6 md:grid-cols-3">
      <div class="card bg-base-100 shadow-sm">
        <div class="card-body">
          <h3 class="text-lg font-semibold">Weekend</h3>
          <p class="text-4xl font-extrabold">€0</p>
          <ul class="mt-4 space-y-2 text-sm">
            <li>✓ One trip at a time</li>
            <li>✓ Up to 25 places</li>
            <li class="opacity-40">✗ Offline maps</li>
          </ul>
          <a class="btn btn-outline mt-6" href="#join">Start free</a>
        </div>
      </div>
      <div class="card border-2 border-primary bg-base-100 shadow-xl">
        <div class="card-body">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold">Explorer</h3>
            <span class="badge badge-primary">Most picked</span>
          </div>
          <p class="text-4xl font-extrabold">€6<span class="text-base font-normal opacity-60"> / month</span></p>
          <ul class="mt-4 space-y-2 text-sm">
            <li>✓ Unlimited trips</li>
            <li>✓ Offline maps</li>
            <li>✓ Shared plans and votes</li>
          </ul>
          <a class="btn btn-primary mt-6" href="#join">Choose Explorer</a>
        </div>
      </div>
      <div class="card bg-base-100 shadow-sm">
        <div class="card-body">
          <h3 class="text-lg font-semibold">Crew</h3>
          <p class="text-4xl font-extrabold">€15<span class="text-base font-normal opacity-60"> / month</span></p>
          <ul class="mt-4 space-y-2 text-sm">
            <li>✓ Everything in Explorer</li>
            <li>✓ Six members</li>
            <li>✓ Shared budget</li>
          </ul>
          <a class="btn btn-outline mt-6" href="#join">Choose Crew</a>
        </div>
      </div>
    </div>
  </div>
</section>
`,
  },
  {
    id: "voices",
    html: `<section data-piece="voices" id="voices" class="mx-auto max-w-5xl px-6 py-20">
  <h2 class="text-center text-3xl font-bold">People who closed their tabs</h2>
  <div id="voices-list" class="mt-12 grid gap-6 md:grid-cols-2">
    <figure class="card bg-base-200">
      <div class="card-body">
        <blockquote class="text-lg">“Ten days in Japan, four people, zero arguments about where to eat. I did not think that was possible.”</blockquote>
        <figcaption class="mt-3 text-sm opacity-70">Inès R. — Lyon</figcaption>
      </div>
    </figure>
    <figure class="card bg-base-200">
      <div class="card-body">
        <blockquote class="text-lg">“The offline map saved us in the Dolomites. The plan was still there when the signal was not.”</blockquote>
        <figcaption class="mt-3 text-sm opacity-70">Tomás K. — Brno</figcaption>
      </div>
    </figure>
  </div>
  <div class="mt-8 text-center">
    <button class="btn btn-ghost" hx-get="/fragments/voices" hx-target="#voices-list" hx-swap="beforeend">Load more voices</button>
  </div>
</section>
`,
  },
  {
    id: "join",
    html: `<section data-piece="join" id="join" class="bg-neutral py-20 text-neutral-content">
  <div class="mx-auto max-w-xl px-6 text-center">
    <h2 class="text-3xl font-bold">Get early access</h2>
    <p class="mt-3 opacity-80">One e-mail when your invitation is ready. Nothing else.</p>
    <form class="join mt-8 w-full" hx-post="/subscribe" hx-target="#join-result" hx-swap="innerHTML">
      <input class="input join-item w-full text-base-content" type="email" name="email" placeholder="you@example.com" required>
      <button class="btn btn-primary join-item" type="submit">Join the list</button>
    </form>
    <div id="join-result" class="mt-4 min-h-6 text-sm"></div>
  </div>
</section>
`,
  },
];

export const tail = `</main>
<footer class="footer footer-center border-t border-base-300 bg-base-100 p-8 text-sm opacity-70">
  <p>© 2026 Fernweh. Made for people who would rather be somewhere else.</p>
  <p id="page-probe" class="font-mono text-xs">page script has not run yet</p>
</footer>
</body>
</html>
`;

export const fragments = {
  voices: `<figure class="card bg-base-200">
  <div class="card-body">
    <blockquote class="text-lg">“I forwarded three booking e-mails and had a plan before my coffee went cold.”</blockquote>
    <figcaption class="mt-3 text-sm opacity-70">Maya O. — Leeds</figcaption>
  </div>
</figure>
<figure class="card bg-base-200">
  <div class="card-body">
    <blockquote class="text-lg">“We voted on every stop from the train. Best group trip we have had.”</blockquote>
    <figcaption class="mt-3 text-sm opacity-70">Jonas W. — Graz</figcaption>
  </div>
</figure>
`,
  subscribed: (email) =>
    `<div role="alert" class="alert alert-success"><span>Thanks — an invitation will reach ${email} soon.</span></div>`,
};

export const heroSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360" width="480" height="360">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#dbeafe"/><stop offset="1" stop-color="#d1fae5"/>
    </linearGradient>
  </defs>
  <rect width="480" height="360" fill="url(#g)"/>
  <path d="M0 250 Q120 200 240 240 T480 210 V360 H0Z" fill="#bfdbfe"/>
  <path d="M90 250 C150 120 260 300 330 130 S420 90 410 80" fill="none" stroke="#2563eb" stroke-width="5" stroke-dasharray="2 12" stroke-linecap="round"/>
  <g fill="#f97316" stroke="#fff" stroke-width="3">
    <circle cx="90" cy="250" r="13"/><circle cx="330" cy="130" r="13"/><circle cx="410" cy="80" r="13"/>
  </g>
</svg>
`;
