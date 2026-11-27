# Build plans

Each plan turns a stretch of design (the decisions in `docs/v2.0-decisions.md` and `docs/adr/`) into slices, each one committed when it works. A plan's first section says which slices are done, with their commits. Plans are written in French, the language Matt and the agent work in; the code and the product stay in English.

| Plan | Covers | State |
|---|---|---|
| [templates-step-5](templates-step-5.md) | Templates: site scripts, the format, the making-templates skill, wave 1, start screen, copy and adapt, distribution (ADR 0011, Q229-Q267) | Complete |
| [pi-harness](pi-harness.md) | Spaka's own harness on Pi for Gemini, OpenAI, ChatGPT and Vertex (ADR 0012, Q268-Q280) | Complete |
| [agent-questions](agent-questions.md) | Question cards and plan mode (Q281-Q296) | Complete |
| [template-guide](template-guide.md) | A template's TEMPLATE.md guide (Q297-Q301) | Complete |
| [template-pages](template-pages.md) | Adapting a template page by page (Q302-Q313) | Complete |
| [look-at-preview](look-at-preview.md) | The agent's look at a page (Q314-Q324) | Complete |
| [tour-and-polish](tour-and-polish.md) | Dark appearance, menus, tooltips, the tour, statistics, icon (Q327-Q342) | Complete |
| [distribution](distribution.md) | 0.2.0 for macOS and the Windows beta (Q361-Q382) | Slices 0-5 done, 6 (release) follows the move to get-spaka |
| [agent-across-providers](agent-across-providers.md) | The agent alike across providers, generate_image, the web-design skill (Q417-Q437) | Complete; checked with the real Gemini, Vertex AI and OpenAI accounts (2026-11-23) |
| [hero-variety](hero-variety.md) | Heroes as varied as the businesses: the bench, seven new heroes, moves, the skills de-primed, the hero rewritten, the move by character, the surface by direction (Q439-Q445) | Complete; measured before and after with Claude and Gemini (2026-11-23) |
| [publish-simple](publish-simple.md) | Publish for a maker with no technical knowledge: the simple way, the advanced options, the domain name (Q552-Q555) | Complete; a real website put online at Netlify left aside, Matt seeing no need for it (2026-11-28) |
| [templates-wave-5](templates-wave-5.md) | Wave 5: nine templates (Batten, Covered, Dogear, Heats, Strum, Spindle, Ruled, Bolster, Overhead), the movement level in place of standard/original, immersive for templates (Q450-Q474) | Complete: the nine released, batches 1 and 2 as v14, batch 3 as v15 (2026-11-25) |
| [image-frame](image-frame.md) | An image set in its frame by hand: zoom, position, fit, proportions, for every screen or one apart (Q547) | Complete, on fixtures; not yet tried on the templates' own images |
| [packages-and-server-modules](packages-and-server-modules.md) | npm packages installed by Spaka's own pnpm, in the browser and on the server; server modules (load, action, route), secrets, SQL; the exports and deploying to Cloudflare from Spaka; the surf school template (ADRs 0013-0015, Q490-Q535) | Designed; slices 0 (the probe), 1 (Spaka's pnpm) and 2 (add_package, its rules, the Packages section) done (2026-11-27) |
