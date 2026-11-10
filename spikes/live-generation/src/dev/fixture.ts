// A canned generation, streamed like the agent would, to tune the preview
// without calling the agent. It exercises the four Liquid cases on purpose:
// unfinished tags (every chunk), a loop over a datasource that does not exist
// yet (plans), a shared part included before it exists (footer), and tracing.
// Throwaway spike code.
import path from "node:path";
import type { AgentEvent } from "../agent/drive.ts";

const THEME = `:root {
  --theme-color-primary: #c2410c;
  --theme-color-primary-content: #fff7ed;
  --theme-color-secondary: #0f766e;
  --theme-color-secondary-content: #f0fdfa;
  --theme-color-accent: #f59e0b;
  --theme-color-accent-content: #1c1917;
  --theme-color-neutral: #1c1917;
  --theme-color-neutral-content: #fafaf9;
  --theme-color-surface: #fffbf5;
  --theme-color-surface-alt: #fdf2e3;
  --theme-color-border: #ecd9bd;
  --theme-color-text: #292524;
  --theme-font-heading: Georgia, "Times New Roman", serif;
  --theme-font-body: ui-sans-serif, system-ui, sans-serif;
  --theme-radius: 1rem;
}
`;

const INDEX = `<!doctype html>
<html lang="en">
<head>
  <title>Ember — a kettle that knows your tea</title>
  <meta name="description" content="Ember heats water to the exact temperature each tea needs.">
  <meta property="og:title" content="Ember — a kettle that knows your tea">
  <meta property="og:description" content="Ember heats water to the exact temperature each tea needs.">
</head>
<body class="bg-base-100 text-base-content">
  <header class="navbar max-w-6xl mx-auto px-6">
    <a class="text-xl font-bold flex-1" href="/">Ember</a>
    <a class="btn btn-primary btn-sm" href="#waitlist">Join the waitlist</a>
  </header>
  <main>
    <section class="hero py-24 bg-gradient-to-b from-base-200 to-base-100">
      <div class="hero-content text-center max-w-3xl flex-col">
        <span class="badge badge-accent badge-lg">Launching in March</span>
        <h1 class="text-5xl md:text-6xl font-bold leading-tight">The kettle that knows your tea</h1>
        <p class="text-lg text-base-content/70 max-w-xl">Green at 80°, oolong at 90°, black at a rolling boil. Ember reads the leaf and stops at the right second.</p>
        <div class="flex gap-3">
          <a class="btn btn-primary btn-lg" href="#waitlist">Join the waitlist</a>
          <a class="btn btn-ghost btn-lg" href="#plans">See the plans</a>
        </div>
      </div>
    </section>
    <section class="max-w-6xl mx-auto px-6 py-20 grid md:grid-cols-3 gap-6">
      {% assign features = "Exact to the degree|Silent boil|Seven days of standby" | split: "|" %}
      {% for feature in features %}
      <article class="card bg-base-200 card-border">
        <div class="card-body">
          <div class="text-3xl">{% cycle "🌡️", "🤫", "🔋" %}</div>
          <h3 class="card-title">{{ feature }}</h3>
          <p class="text-base-content/70">Built for people who would rather taste the tea than watch the thermometer.</p>
        </div>
      </article>
      {% endfor %}
    </section>
    <section id="plans" class="bg-base-200 py-20">
      <div class="max-w-4xl mx-auto px-6">
        <h2 class="text-4xl font-bold text-center mb-10">Two ways to pre-order</h2>
        <div class="grid md:grid-cols-2 gap-6">
          {% for plan in plans %}
          <div class="card bg-base-100 card-border {% if plan.featured %}ring-2 ring-primary{% endif %}">
            <div class="card-body">
              <h3 class="card-title">{{ plan.name }}</h3>
              <p class="text-4xl font-bold">{{ plan.price }} €</p>
              <p class="text-base-content/70">{{ plan.summary }}</p>
              <a class="btn {% if plan.featured %}btn-primary{% else %}btn-outline{% endif %} mt-4" href="#waitlist">Choose {{ plan.name }}</a>
            </div>
          </div>
          {% endfor %}
        </div>
      </div>
    </section>
    <section id="waitlist" class="max-w-xl mx-auto px-6 py-20 text-center">
      <h2 class="text-4xl font-bold mb-3">Be first in line</h2>
      <p class="text-base-content/70 mb-6">One e-mail when Ember ships. Nothing else.</p>
      <form class="join w-full" hx-post="/data/waitlist" hx-target="#waitlist-result" hx-swap="innerHTML" hx-on::after:request="if (ctx.response.status < 400) this.reset()">
        <input class="input join-item flex-1" type="email" name="email" placeholder="you@example.com" required>
        <button class="btn btn-primary join-item">Join</button>
      </form>
      <div id="waitlist-result" class="mt-4"></div>
    </section>
  </main>
  {% render 'footer' %}
</body>
</html>
`;

const FOOTER = `<footer class="footer footer-center bg-neutral text-neutral-content p-10">
  <p class="font-bold text-lg">Ember</p>
  <p>Made slowly in Lyon. © 2026</p>
</footer>
`;

const PLANS = JSON.stringify(
  {
    kind: "authored",
    fields: { name: "text", price: "number", summary: "text", featured: "boolean" },
    records: [
      { name: "Ember", price: 129, summary: "The kettle, in sand or slate.", featured: false },
      { name: "Ember + Leaves", price: 169, summary: "The kettle and six teas chosen to show it off.", featured: true },
    ],
  },
  null,
  2,
);

const WAITLIST = JSON.stringify({ kind: "collected", fields: { email: "email" }, records: [{ email: "ada@example.com" }] }, null, 2);
const CREATED = `<div class="alert alert-success" role="status">You are on the list, {{ record.email }}.</div>\n`;

/** Events as the driver would emit them, at about `charsPerSecond`. */
export function fixtureEvents(projectDir: string, charsPerSecond = 420): AgentEvent[] {
  const events: AgentEvent[] = [];
  let t = 380;
  const push = (e: Record<string, unknown>) => events.push({ t: Math.round(t), ...e } as AgentEvent);
  push({ kind: "init", model: "fixture", permissionMode: "auto", apiKeySource: "none", version: "fixture", tools: [] });
  t = 950;
  push({ kind: "request-start", n: 1 });
  push({ kind: "first-token", n: 1 });
  for (const word of "Building a launch page for Ember, with plans and a waitlist.".split(/(?<= )/)) {
    push({ kind: "text", text: word });
    t += 25;
  }
  let n = 0;
  const write = (rel: string, content: string) => {
    const id = `fixture-${++n}`;
    const json = JSON.stringify({ file_path: path.join(projectDir, rel), content });
    push({ kind: "tool-start", id, name: "Write" });
    t += 120;
    for (let i = 0; i < json.length; ) {
      const size = 8 + ((i * 7) % 13);
      push({ kind: "tool-input", id, name: "Write", json: json.slice(i, i + size) });
      i += size;
      t += (size / charsPerSecond) * 1000;
    }
    push({ kind: "tool-input-end", id, name: "Write", input: { file_path: path.join(projectDir, rel), content }, chars: json.length, deltas: 0, firstDeltaT: 0 });
    t += 15;
    push({ kind: "tool-result", id, name: "Write", isError: false, text: "File created successfully" });
    t += 650; // the model's next request
  };
  write("theme.css", THEME);
  write("pages/index.liquid", INDEX);
  write("parts/footer.liquid", FOOTER);
  write("data/plans.json", PLANS);
  write("data/waitlist.json", WAITLIST);
  write("fragments/waitlist-created.liquid", CREATED);
  push({ kind: "text", text: "The launch page is ready." });
  t += 100;
  push({ kind: "result", subtype: "success", isError: false, durationMs: t, apiMs: t, turns: n + 1, text: "The launch page is ready.", usage: {}, modelUsage: {}, denials: [] });
  return events;
}
