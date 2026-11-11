// A made-up recording of the agent building a website of many pages, for the
// checks of the "All pages" view (Q128–Q140): a theme, then each page written
// in small pieces, as the agent's stream gives them. Played back like the
// recordings of the real agent (apps/desktop/src/main/agent/replay.ts).
import { writeFileSync } from "node:fs";

const ROOT = "/recorded/many";
const THEME = `:root {
  --theme-color-primary: #1d4ed8;
  --theme-color-primary-content: #eff6ff;
  --theme-color-surface: #f8fafc;
  --theme-color-surface-alt: #e2e8f0;
  --theme-color-text: #0f172a;
  --theme-font-heading: Georgia, serif;
  --theme-font-body: system-ui, sans-serif;
  --theme-radius: 0.5rem;
}
`;

export const PAGE_NAMES = ["index", "menu", "about", "team", "events", "gallery", "prices", "blog", "faq", "contact"];

function page(name: string): string {
  const title = name === "index" ? "Le Bloc" : name.charAt(0).toUpperCase() + name.slice(1);
  const sections = Array.from(
    { length: 4 },
    (_, i) => `  <section class="p-12 ${i % 2 ? "bg-base-200" : ""}">
    <h2 class="text-3xl font-bold">${title}, part ${i + 1}</h2>
    <p class="mt-4 max-w-2xl">A climbing gym in Grenoble with walls for every level, coaching, and a café upstairs. This is section ${i + 1} of the ${title} page.</p>
  </section>`,
  ).join("\n");
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${title}</title></head>
<body>
  <header class="navbar bg-base-100 px-6"><a href="/" class="text-xl font-bold">Le Bloc</a></header>
  <section class="hero min-h-96 bg-primary text-primary-content">
    <div class="hero-content text-center"><h1 class="text-5xl font-bold">${title}</h1></div>
  </section>
${sections}
</body>
</html>
`;
}

/** Writes a recording of one turn building `count` pages into `file`. `chunk` characters every `step` ms. */
export function writePagesRecording(file: string, count = PAGE_NAMES.length, { chunk = 60, step = 12 } = {}) {
  const lines: string[] = [];
  let t = 100;
  const line = (m: unknown) => {
    lines.push(JSON.stringify({ t, m }));
    t += step;
  };
  const event = (e: unknown) => line({ type: "stream_event", parent_tool_use_id: null, event: e });
  line({
    type: "system",
    subtype: "init",
    session_id: "replay-many",
    cwd: ROOT,
    model: "claude-sonnet-5-5",
    tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
    mcp_servers: [],
    skills: [],
    apiKeySource: "none",
    claude_code_version: "2.1.321",
  });
  event({ type: "message_start", message: {} });
  const files: [string, string][] = [
    ["theme.css", THEME],
    ...PAGE_NAMES.slice(0, count).map((n) => [`pages/${n}.liquid`, page(n)] as [string, string]),
  ];
  files.forEach(([path, content], index) => {
    const id = `w${index + 1}`;
    event({ type: "content_block_start", index, content_block: { type: "tool_use", id, name: "Write", input: {} } });
    const json = JSON.stringify({ file_path: `${ROOT}/${path}`, content });
    for (let at = 0; at < json.length; at += chunk)
      event({
        type: "content_block_delta",
        index,
        delta: { type: "input_json_delta", partial_json: json.slice(at, at + chunk) },
      });
    event({ type: "content_block_stop", index });
    line({
      type: "assistant",
      parent_tool_use_id: null,
      message: {
        role: "assistant",
        content: [{ type: "tool_use", id, name: "Write", input: { file_path: `${ROOT}/${path}`, content } }],
      },
    });
    line({
      type: "user",
      parent_tool_use_id: null,
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: "ok" }] },
    });
  });
  line({
    type: "result",
    subtype: "success",
    is_error: false,
    result: "The website is ready.",
    duration_ms: t,
    total_cost_usd: 0,
  });
  writeFileSync(file, `${lines.join("\n")}\n`);
}
