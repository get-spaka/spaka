# Heats: brief

One of wave 5's templates: an open-source project's site, written for an imaginary open-weights AI model (`app`, Q470). Its motion is expressive, and carried by one device: every benchmark is a heat, a race between the same four lanes, whose bars run out to their figures when the heat comes into view, the model's own bar finishing first, with "Run again" to start them over. The figures are also in a plain table under the bars, so nothing is told only by the animation. The first screen is the model family itself, a numbered index of its sizes with their figures, on graph paper.

`heats` is a working name: the heats of a race, run lane by lane, which is how the evals are shown. A web search found no website template or theme called Heats on Framer, Webflow, ThemeForest, Squarespace or Shopify. The nearest are Framer's HVAC templates Heatix, Heatr and Heatvora, and "Heat", one of the five presets of Shopify's Madrid theme, which is a preset of another theme and singular. The name is the template's, not the project's.

## Concept

**Concept.** An open-weights model's site drawn as an engineering sheet on graph paper. It opens on the family, a numbered index of the five sizes, each a ruled row with its parameters, its context, its size on disk and the machine it runs on, the way a parts list opens a set of plans. A title block in the corner gives the revision, the date and the license. Under the index, the command to copy, in tabs: Ollama, Python, Hugging Face, llama.cpp. Then its evals run as heats, its openness is a ledger of what is published line by line, its license is said in plain words, its technical report is "the blueprint", and the people who make it stand along a ruler of time zones. The site is cool and exact, like drafting film under a lamp: a Clarendon serif with a voice for the headings and the model names, a calm humanist sans for reading, a narrow mono with a cursive italic for the commands and the spec labels, a graph-paper white, a blueprint blue, one band of blueprint ground per page, and a redline orange kept for two marks.

It must not read as Beacon, Pocket or Overhead. Beacon is a launch on a blue-black screen whose app window tilts out of a violet glow; Pocket an app shown on phones in a fan over a soft glow; Overhead, its sibling in this wave, a coworking space drawn as a floor plan from above, in bright cyan on warm paper, whose zones light as a plan is picked. Heats is a project's datasheet: its first screen is a list of figures, its picture a race between bars, its paper cool and gridded.

**The fictional project** its texts are written for is **Dunlin**, a family of open-weights language models made by the **Dunlin Project**, a nonprofit open-source project with no office. It is named after the dunlin, a small sandpiper that crosses continents twice a year and flies in flocks that turn as one: small models that go a long way, made by many people who turn together.
- **The people:** started in October 2024 in a public forum thread by **Ines Carvalho** (she/her, Lisbon, UTC+0), then finishing a PhD on tokenizers, and **Mathilde Roy** (she/her, Montréal, UTC−5), an evaluation engineer. They wanted to train a small model on data they could publish. Today the project has fourteen maintainers in ten time zones, from **Hollis Grant** (they/them, Seattle, UTC−8, release engineering) to **Jae-won Park** (he/him, Seoul, UTC+9, safety evals), and 212 contributors. Decisions go by public RFC on the forum. A steering group of five maintainers is elected each January. The accounts are published every quarter. There is no company and no paid tier.
- **The release:** **Dunlin 3**, revision 3.1, published March 4, 2027. Five models, each released as base and instruct weights:
  1. **Dunlin 3 Mini**: 1.6B parameters, 32K context, 1.1 GB at 4-bit; runs on a phone or a Raspberry Pi 5.
  2. **Dunlin 3 Small**: 4B, 128K, 2.6 GB; runs on a laptop with no graphics card.
  3. **Dunlin 3**: 14B, 128K, 8.9 GB; runs on one 12 GB graphics card. The one most people start with.
  4. **Dunlin 3 Flock**: 62B in all, a mixture of 64 experts with 7B active, 256K context, 37 GB; runs on a 48 GB workstation.
  5. **Dunlin 3 Coder**: 14B, 128K, 8.9 GB, tuned for code in 40 languages; runs in an editor on one 12 GB card.
- **The training:** 9.4 trillion tokens, 92% of them downloadable from the project's data manifest; the rest is listed by source but may not be redistributed. Nine languages: English, Spanish, Portuguese, French, German, Hindi, Swahili, Korean and Traditional Chinese. A checkpoint every 50 billion tokens, 1.9 million GPU-hours, knowledge up to June 2026.
- **What is published:** the weights and the training code under Apache-2.0, the data manifest, the checkpoints, the training logs, and every eval's config and raw outputs. The reward model is not yet out ("in 3.2").
- **The evals:** run by the project on its own harness, with the same settings for every lane, the mean of three seeds. Each model is compared with its predecessor, Dunlin 2, and with two open models of similar size that the texts call **Baseline A** and **Baseline B**. No real model is named, and every figure in the template is a placeholder.
- **Compute and money:** four sponsors and the project's donors:
  - the Saltmarsh Compute Cooperative: 1.1 million GPU-hours on H200s, 2026 to 2027;
  - Northgate University Research Computing: 480,000 GPU-hours on A100s;
  - the Calloway Institute for Open Science: $620,000 over two years, which pays two maintainers;
  - Fennhollow Hosting: storage, and 3.2 petabytes of downloads a month;
  - 412 people giving every month.

The names were searched. No language model, model family or AI project called Dunlin came up on Hugging Face, GitHub, PyPI or the web. The name is used only by a few small unrelated projects: an ODE package at version 0.0.3 on PyPI, an R package for clinical data, a personal CDN and a Fennel web browser. `dunlin-lm` is free on PyPI and `dunlin3` on Ollama's library, so the template's commands point at nothing real. The sponsors' names gave no result. The project has no address, phone or city: its place is its ten time zones.

The same structure suits any open-source project:
- **another open model:** a language, vision, speech or image model;
- **a library:** the index lists its packages or what it does, each with a figure (size, dependencies, startup time), and the heats compare operations per second, bundle size or memory;
- **a command-line tool:** the tabs hold the package managers (Homebrew, npm, cargo, winget);
- **a database:** the heats race queries per second and latency at p99.

The agent rewrites the index, the heats and their lanes, the commands, the ledger, the license, the report, the revisions, the people and the sponsors.

## Trends it draws on

These come from twenty sites and pages of open-weights models and labs, opened in November 2026, with the browser for their first screens and WebFetch for their text. Their fonts were read from their stylesheets with curl. They are combined with the earlier study of fifteen open-source developer tools (ghostty.org, zed.dev, bun.sh, astro.build, biomejs.dev, deno.com, vite.dev, oxc.rs, tailwindcss.com, gleam.run and others). One site would not open in the browser: apertvs.ai, the Swiss AI page, which swiss-ai.org now redirects to. Each trend below was seen on at least two sites.

1. **The family as a list of sizes with their figures, the table developers read to choose one.** qwenlm.github.io/blog/qwen3 (two tables of the dense and MoE models: layers, heads, experts, context length); github.com/deepseek-ai/DeepSeek-V3 (its Model Downloads table: Total Params, Activated Params, Context Length, Download); ollama.com/library/gemma3 (the sizes as pills from 270m to 27b, then each tag's size, context and input); mistral.ai/models ("119B total · 6.5B active" on each card); moondream.ai (three cards marked Recommended, Stable and Tiny, "9B MoE, 2B active"); allenai.org/olmo (six variants, "Pick a variant to explore weights, code and reports"); deepmind.google/models/gemma/gemma-4 (the sizes told by where they run, "E2B & E4B" for phones, "12B, 26B, 31B" for personal computers).
2. **The run command as the main button, copyable, often in tabs.** moondream.ai ("$ pip install moondream" with a copy button under the hero's two buttons, then "5M+ monthly downloads · open weights · commercial use"); hermes-agent.nousresearch.com ("Install via terminal" with macOS, Linux and Windows tabs over a curl line); primeintellect.ai ("$ uv tool install prime" under its hero); ollama.com/library/gemma3 (CLI, cURL, Python and JavaScript tabs over `ollama run gemma3`); huggingface.co/allenai/Olmo-3-7B-Instruct (`pip install`, `vllm serve "allenai/Olmo-3-7B-Instruct"`, `docker model run hf.co/…`); qwenlm.github.io/blog/qwen3 (`vllm serve`, `python -m sglang.launch_server`, `ollama run qwen3:30b-a3b`); the developer tools do the same (bun.sh, biomejs.dev, tauri.app's nine tabs).
3. **The evals as proof: one's own model in the brand color, the others gray, the figures in a table, the method in a footnote.** moondream.ai (latency bars, its own in cyan marked "baseline", the others gray with "1.2× slower", then a mono footnote of the test split, the batch and the GPU, "full data on GitHub"); deepmind.google/models/gemma/gemma-4 (a "Model Performance VS Size" scatter with Gemma in a blue region and the others gray, then a table with the 31B column in bold beside its own Gemma 3 27B); github.com/deepseek-ai/DeepSeek-V3 (tables in which "best results are in bold", its own V2 and V2.5 among the columns); huggingface.co/allenai/Olmo-3-7B-Instruct (20 benchmarks by 9 columns, its own SFT, DPO and final stages beside Olmo 2); huggingface.co/blog/smollm3 (a win-rate chart against other 3B models); eleuther.ai (three figures in its hero: "200+ Publications", "65,000+ Citations", "157M+ Model Downloads"). Among the developer tools, only bun.sh races its benchmark, with a replay.
4. **Openness as an itemized list of what is published, not a slogan.** allenai.org/olmo ("fully open… complete model flow", data cards for the pretraining, mid-training and post-training sets, each tool named); marin.community ("Open means that we share everything:", then the discussions, the code, the weights, the data sources with a token-count viewer, the experiments as GitHub issues); eleuther.ai (a Data / Code / Models table, from The Pile to Pythia "with checkpoints"); huggingface.co/blog/smollm3 ("We're releasing SmolLM3 with our engineering blueprint", the data mixture by stage, "384 H100 GPUs for 24 days"); nousresearch.com ("Open Source • MIT License" over its name).
5. **Compute and funders thanked by name, with what they gave.** marin.community (the Google TPU Research Cloud for the TPUs, the Huang Foundation for the GPUs, Schmidt Sciences and others); kyutai.org (Iliad Group, CMA CGM Group and Schmidt Sciences, "Many thanks to our generous donors"); huggingface.co/blog/smollm3 (the GPUs and the days); primeintellect.ai (a "Backed by" list). The common form is a flat row of logos (bfl.ai, primeintellect.ai), which the developer-tool study also named a cliché.
6. **Mono spec labels, brackets and slashes, on a visible grid, under a face with a voice, and a mascot.** kyutai.org ("// WELCOME TO KYUTAI", "// TRY OUR DEMOS · MULTIMODAL, STREAMING, REAL-TIME", its demos as ASCII-art cards); essential.ai ("[ FRONTIER OPEN SOURCE PLATFORM ]", a bracketed menu, a serif headline); moondream.ai (numbered markers 01 and 02 on a ruled left edge, "STEP 1 · TRY IT", Space Grotesk with JetBrains Mono); primeintellect.ai (a hairline grid of tiles with mono callouts on leader lines, Favorit with Geist Mono); liquid.ai/models (an italic Newsreader, "real-world constraints.", over Inter and Geist Mono in a hairline frame); marin.community (Shippori Mincho and Noto Serif on paper, a sailboat seal, a loss chart beside the headline); nousresearch.com (a compressed gothic in electric blue, an engraved seal). The mascots: Ollama's llama, the SmolLM character on its card (huggingface.co/HuggingFaceTB/SmolLM3-3B), Nous's seal, Marin's boat. This joins the developer tools' grids and voices (tailwindcss.com, oxc.rs, zed.dev's blue IBM Plex Serif italic, ghostty.org's ASCII ghost).
7. **A dated release log.** deepmind.google/models/gemma (sixteen dated release cards, from Gemma 3 270M to EmbeddingGemma 2); mistral.ai/models ("Inside the work", dated); liquid.ai/models ("Latest model releases", August to November 2026); kyutai.org ("// LATEST NEWS", dated).

**The gap.** The figures are everywhere and readable almost nowhere: as pictures a screen reader cannot read (Qwen3's charts), as dense tables (DeepSeek, OLMo's card), or as one static chart (Gemma 4, Moondream). No model site makes an eval something you watch; only a developer tool races its benchmark. And the family, which developers choose from in Ollama's and DeepSeek's tables, is shown on the labs' own sites as cards with icons. Heats draws its first screen from trend 1, the table developers actually read, as a numbered index on graph paper, and its signature from trend 3: each eval a heat between the same lanes, the figures arriving as the bars finish, with the plain table and the method under them.

**Common and left outside:** a chat box or a playground as the hero (allenai.org/olmo's "Chat with Olmo", Gemma's "Try in Google AI Studio", Moondream's playground), violet and blue gradient glows (essential.ai, pleias.ai, OLMo's dark green haze), "AGI" in a tagline (qwenlm.github.io, kyutai.org), line constellations and node diagrams (essential.ai, primeintellect.ai), partner logo walls (bfl.ai, primeintellect.ai), news carousels (Gemma's "Slide 1 of 16"), embedded X posts (nousresearch.com), videos, newsletter pop-ups and live star counters.

**What makes it its own:**
- **the index:** the first screen is the family as a numbered list. Each model is a ruled row: its number in mono (01 to 05), its name in Besley, its parameters, context and size at 4-bit, and in words the machine it runs on, under small mono spec labels for column heads (No., Model, Parameters, Context, At 4-bit, Runs on). Each row leads to its model card; the one most people start with is marked so. Beside the list stands a title block, as in the corner of a drawing: the revision, release date, license, tokens, checkpoints and maintainers, in ruled cells;
- **the heats:** each benchmark is a heat of four lanes, always the same four in the same order: the model, its predecessor, Baseline A and Baseline B. As a heat comes into view, the bars leave together and run out to their figures; the best figure arrives first, a short redline tape marks the leader, and each figure appears as its bar finishes. "Run again" starts them over. Table 1 below holds the same figures, the best of each row in bold, the method in a footnote. The order in which the bars finish follows the figures, never a choice in the script: in the template's placeholders the model leads every heat, so its bar finishes first; with the maker's own results, a heat the model loses is lost on screen too;
- **the run strip:** the command to copy, on a band of blueprint ground, in tabs (Ollama, Python, Hugging Face, llama.cpp), a "Copy" button that swaps to "Copied", and a comment line in Victor Mono's cursive italic saying what the command costs (`# 8.9 GB at 4-bit · one 12 GB card`). The tab a visitor picks stays picked on every page of their visit;
- **the ledger:** what is published, item by item (the weights, the training code, the data manifest, the checkpoints, the logs, the eval outputs, the reward model), each Published, Partly or Not yet, with where to get it, in place of "fully open";
- **the plates:** the dunlin drawn as a natural-history engraving, in ink lines the graph paper shows through: the project's mascot, on the community section and the report's cover;
- **the time-zone ruler:** the maintainers placed along a ruled scale from UTC−8 to UTC+9, which is where the project lives.

**What it leaves out:**
- the AI clichés: violet or blue gradient glows, sparkles, neural-network node graphs, glowing brains, robots, "AGI", a chat box or playground as the hero, a model "thinking" in a typing animation;
- the developer-tool clichés: a fake terminal typing out a boot sequence, a logo wall under the hero or a flat grid of sponsor logos, "Get started" beside "View on GitHub", three pillars of Fast, Simple and Secure, bento boxes over noise gradients, an announcement bar with a version pill, "Ship faster";
- live data: star counters or download counts fetched from another site, a Discord widget, an embedded demo. The figures are typed facts;
- **other templates' devices:** Beacon's aperture glow and tilting window; Pocket's phones in a fan, and any app window or device mockup; lines that draw themselves (Chalk, Seam) and dimension lines with their arrows (Trestle): the index's rules and the bars' tracks are simply there; a jar or gauge that fills (Commons); a marker climbing a hill chart (Coteau); a dial (Transfer); the sun or the time of day drawn as a picture (Gnomon), or anything following the clock (Saucer, Taper, Pail, Decal): the time-zone ruler is static; a light following the pointer (Ember), pictures following the cursor (Folio), an off-register stencil (Transfer), a red-pen strikethrough (Codicil), pictures printed in one ink and developing (Margin); letters stretching or rising (Marquee, Folio), read-along captions (Earshot), anything scrolling sideways (Reel); a huge wordmark across the footer (Corner, Ember, Seam), an italic accent word in a heading (Corner, Folio, Linen), tilted cards (Ember);
- **this wave's devices:** Overhead's plan drawn from above with its zones lighting (Heats draws no plan and lights no zone), Covered's tidy-up (the lanes never re-sort or move from their order), Bolster's mats unrolling, Ruled's linked hover lighting a calendar, Strum's vibrating rules;
- figures that count up digit by digit: a script never writes the site's texts, so a figure appears whole when its bar arrives;
- smooth scrolling, page transitions and WebGL: the browser's own scroll, for people who copy a command and scroll a wide table sideways.

## Type

All three are files of the template, as `woff2` subset to Latin and Latin Extended (for names such as Carvalho, Adeyemi and Njoroge), under the SIL Open Font License, from Google Fonts, declared in `styles/site.css`. Each was checked in Google Fonts' own metadata:
- **Besley** (Owen Earl): a variable file of weight 400 to 900 and its italic of the same range, with tabular and old-style figures. It has no light weight, so the headings never go below 400.
- **Source Sans 3** (Paul D. Hunt): a variable file of weight 200 to 900 and its italic.
- **Victor Mono** (Rune Bjørnerås): a variable file of weight 100 to 700 and its italic, a semi-connected cursive. Its programming ligatures (`calt`) are turned off in commands (`font-variant-ligatures: none`), so that what you copy is what you see.

| Role | Font | Setting |
|---|---|---|
| Headings | Besley | the hero at `clamp(2.5rem, 3.6vw + 1rem, 4.25rem)` in 500, `leading-[1.02]`, `tracking-[-0.02em]`, `text-balance`; section headings at `clamp(1.875rem, 2vw + 1rem, 2.875rem)` in 500; small headings (a heat's name, a revision's title, a person's name) at 1.25 rem in 600; sentence case |
| Model names and big figures | Besley | the index's names at `clamp(1.5rem, 1.6vw + 1rem, 2.25rem)` in 600; a model card's name at hero size in 700; the community figures ("212") at `clamp(2.25rem, 3vw + 1rem, 3.5rem)` in 600 with `tabular-nums`; its italic only for figure and table captions ("Fig. 1 · The data, by source") |
| Body | Source Sans 3 | 400, 1.0625 rem, `leading-relaxed`, `text-base-content/80`, measure `max-w-[64ch]`; a model card's text and the report in a reading column at 1.125 rem; buttons 600 at 1 rem, sentence case |
| Commands, figures and spec labels | Victor Mono | commands at 0.9375 rem in 500, with `font-variant-ligatures: none`; their comments in the cursive italic at 400; the index's and the tables' figures in 500 with `tabular-nums`; spec labels (column heads, sheet numbers, the title block's keys, "Heat 2") at 0.6875 rem in 600, uppercase, `tracking-[0.08em]`, as lettering on a drawing |

Besley is a Clarendon: bracketed slabs, ball terminals, a sturdy upright and a soft italic. It is the face of Victorian posters, ledgers and engineering catalogs, which gives the headings a voice no grotesk has. The study saw this voice on liquid.ai's italic Newsreader, marin.community's Mincho and zed.dev's IBM Plex Serif. Source Sans 3 is a calm humanist sans that reads well at length, as model cards and reports must. Victor Mono is narrow, so long commands fit a phone. Its cursive italic sets the comments apart from what is typed, the way an editor shows them.

Ruled out:
- every font the 28 templates ship (the inventory's list) and every font of this wave's other rows;
- the faces the labs and developer tools use most (Inter, Geist and Geist Mono, JetBrains Mono, Space Grotesk, Roboto Mono, IBM Plex Mono), which would make it read as any developer site;
- compressed gothics, which are Nous's look and this wave's Batten's.

**If a sibling takes them,** two pairings keep the same voice (a slab serif with an italic, a humanist sans, a mono with italics):
- **Bitter** (a slab of weight 100 to 900 with its italic) with **Work Sans** (body) and **Sometype Mono** (commands);
- **Rokkitt** (a geometric slab of weight 100 to 900 with its italic) with **Fira Sans** (body) and **Intel One Mono** (commands).

All six are on Google Fonts under the OFL, with Latin Extended, and none is used by the inventory or by the wave sheet.

## Palette

Graph-paper white, vellum, drafting ink, blueprint blue, a cyanotype wash, a blueprint ground and a redline orange. Every pair of text and background passes WCAG AA, measured from these values (converted from oklch to sRGB, with the WCAG formula): ink on graph paper 15.0:1, on vellum 13.6:1, on the wash 12.3:1, on redline 4.9:1; blueprint blue on graph paper 5.4:1, on vellum 4.9:1; paper on blueprint blue 5.5:1; light text on the blueprint ground 11.5:1, the wash on the ground 9.9:1; `text-base-content/70` on graph paper 6.4:1, on vellum 6.0:1, on the wash 5.7:1.

Never text: redline is 3.1:1 on graph paper and 2.8:1 on vellum, so it is a mark only (the leader's tape, a revision's triangle), set on graph paper or on the ground (4.0:1), never on vellum. Blueprint blue on the ground is 2.2:1: commands and links there use the light text and the wash. Blueprint blue on the wash is 4.5:1, just short: there it is kept for large type, and the wash's links are ink.

| Variable | Value | What it is |
|---|---|---|
| `--theme-color-surface` | oklch(0.982 0.006 246) | graph paper: the page, a cool white with its grid |
| `--theme-color-surface-alt` | oklch(0.948 0.016 246) | vellum: the tables' panels, the title block's cells, the forms |
| `--theme-color-text` | oklch(0.255 0.06 250) | drafting ink, a deep blue black |
| `--theme-color-primary` | oklch(0.51 0.13 246) | blueprint blue: the model's own bar, buttons, links, the selected tab's rule, the index's hover |
| `--theme-color-primary-content` | oklch(0.985 0.005 246) | paper on blue |
| `--theme-color-secondary` | oklch(0.915 0.04 242) | cyanotype wash: the ledger's band, one light band per page, links on the ground |
| `--theme-color-secondary-content` | oklch(0.255 0.06 250) | ink on the wash |
| `--theme-color-accent` | oklch(0.67 0.17 38) | redline: the heat leader's tape, a revision's triangle, nothing else |
| `--theme-color-accent-content` | oklch(0.255 0.06 250) | ink on redline |
| `--theme-color-neutral` | oklch(0.32 0.09 250) | blueprint ground: the run strip, the report's band, the footer |
| `--theme-color-neutral-content` | oklch(0.965 0.012 246) | paper lines and text on the ground |
| `--theme-color-border` | oklch(0.885 0.028 246) | the grid's lines and the hairlines |
| `--theme-radius` | 0.125rem | a drafting corner, barely rounded |

**The graph paper** is not an image. `styles/site.css` draws it from the border color with four `linear-gradient`s on the page: a major line every 40 px in `var(--color-base-300)`, a minor line every 8 px at half its strength (`color-mix(in oklch, var(--color-base-300), transparent 50%)`). On the blueprint ground it is drawn in the content color at 10%, as a blueprint's own grid. Reading columns (a model card's text, the report, a revision's notes, the license) keep only the major lines, so long text sits on calm paper. With no theme change it is pale and blue; with another palette it follows.

**The bars** are drawn from the theme too: the model's own bar solid blueprint blue (5.4:1 against the paper), its predecessor's the same blue in diagonal stripes (`repeating-linear-gradient` at 45°), the family's earlier revision, and the baselines solid ink at 50% (3.5:1). So the lanes differ by pattern and by their written names, never by color alone, and every bar passes the 3:1 that graphics need.

Other settings: buttons and fields square (`--theme-radius-field: 0rem`), the main one solid blue, the other outlined in ink; relief off (`--theme-depth: 0`); density normal (`--theme-size: 0.25rem`); fine borders (1px). Tabs are drafting tabs, square, the selected one underlined 2 px in the primary (in the wash on the ground). Links in text are blue, underlined 1 px with a 3 px offset. The status colors are derived, as always: the forms' errors and the "Copied" confirmation use them.

It is not Plinth's dusk blue (h 258), Corner's cobalt or Codicil's iron-gall (h 262), Mend's lake (h 220), Taper's blue-green (h 215), nor Overhead's bright cyan (h 214) on warm paper. Its blue sits at h 246, where no template has a primary yet, on a cool gridded white, with one deep blueprint ground and a redline kept for marks.

## Motion

Expressive, by its character: a project that shows its work and invites you to check it. The heats are its one device, repeated across its pages; the rest stays quiet. Everything respects `prefers-reduced-motion`. In edit mode nothing moves, since Upstart's stillness rule stops CSS animations and transitions and no script runs: every bar stands at its full length with its figure beside it and the leader's tape in place, every tab set shows its first tab, every "Copy" reads "Copy". Each effect is turned on by an attribute, so a new section can have it too. Nothing follows the clock, so `template.json` sets no `shoot.clock`.

- **The heats** (`data-heats` on the section, `data-heat` on each heat, `data-lane` on each lane; `scripts/heats.js`, with Motion's `inView` and `animate`):
  - in CSS, complete with no script: each bar's length comes from custom properties written on it by Liquid (`style="--v: 61.8; --scale: 100"`, numbers only), as `inline-size: calc(var(--v) / var(--scale) * 100%)`; the track behind it shows the graph paper, with four ticks of the scale in mono above the first lane; the figure stands in a right-hand column, `tabular-nums`, so the figures line up like a results board. Liquid finds each heat's best figure (the highest, or the lowest when the heat's `better` is `lower`) and marks that lane `data-lead`, where the stylesheet draws the leader's tape, a 2 px redline rule at the bar's end, the height of the lane;
  - in visitor mode, under no-preference, `start` sets each bar to `scaleX(0)` (`transform-origin: left`) and each figure and tape to `opacity: 0`, just before they run. As each heat comes into view (`inView`, 40% of it shown), the script ranks the lanes from their `data-figure` and the heat's `data-better`, and after a 150 ms "set" every bar leaves at once: `scaleX: [0, 1]`, its duration set by its place (0.8 s for the leader, then 0.22 s more for each place: 1.02, 1.24, 1.46 s), `ease: [0.3, 0, 0.2, 1]`. Tied figures share a place and finish together. Each figure appears as its bar arrives (`opacity: [0, 1]`, 0.18 s), and the leader's tape drops in once the leader has finished (`scaleY: [0, 1]`, 0.2 s). A lane without a figure shows a dash and no bar, and the script skips it. Heats lower on the page start as they come into view; none waits for another;
  - **"Run again"** (`data-heats-rerun`, a plain `<button type="button">` in the section's markup, so the maker sees and edits its label): a click sets the section's bars back to zero and runs its heats again, 120 ms apart. Under `prefers-reduced-motion: reduce`, where there is nothing to replay, the stylesheet hides it; with no script it does nothing;
  - the bars are `aria-hidden`, and each lane's name and figure are text; Table 1, a real `<table>` with its `<caption>`, holds every figure, so a screen reader and a visitor with no script miss nothing. On a phone, the lane's name sits above its bar and the bar takes the width;
  - `stop` cancels the animations, removes the listeners and the observers, and takes off the styles it set.
- **The run tabs** (CSS only): daisyUI's radio tabs (`<input type="radio" class="tab" aria-label="Ollama">` then its `.tab-content`), so they work with no script and with the keyboard's arrow keys. The first tab is checked in the markup.
- **The tab you picked** (`data-run-tabs` on each tab set, `scripts/run-tabs.js`, no library): when a visitor picks a tab, the script keeps its label in `sessionStorage` and checks the tab of the same label in every other set, on this page and the next. It writes no text and moves nothing. `stop` removes its listeners.
- **Copy** (`data-copy` on a button beside its `<code>`, `scripts/copy.js`, no library): the button holds two labels written in the template, "Copy" and "Copied"; a click writes the code's text to the clipboard and sets `data-copied` on the button for 1.6 s, and the stylesheet shows the label that matches. With no script the code has `select-all`, so one click selects the whole command. `stop` removes the listeners and the attribute.
- **The index** (CSS, and `data-reveal="stagger"`): on hover or focus (150 ms) a row's name and rules turn blueprint blue and its arrow moves 4 px to the right; on load the rows rise into place one after another (`y: [12, 0]`, `opacity: [0, 1]`, 0.5 s, 60 ms apart).
- **Reveals** (`data-reveal`, `scripts/reveal.js`, Motion's `inView`): as in the site-scripts skill, a section's main elements rise a little (`y: [16, 0]`, `opacity: [0, 1]`, 0.6 s, `ease: [0.22, 1, 0.36, 1]`), children 60 ms apart under `data-reveal="stagger"`. Nothing else in the page enters.
- **The header** is sticky on the paper at 92%, with a hairline under it, and does not change as you scroll.

No smooth scrolling, no page transitions, no loader, no WebGL, no Splitting. The library is Motion, pinned on jsDelivr (`motion@14.9.0`), under MIT; everything else is CSS. The shoot shows each heat finished, as the page settles.

## Pages

The models are the template's own `models` collection, read by the index on every page that shows it, by the model cards and by the run tabs of each card. The heats are the template's own `heats` collection: the home page shows those marked `home`, the evals page all of them, and the report two. The lanes' names and notes are written once, in `parts/heats.liquid`, so a change there changes every heat. Every "Get the weights" button leads to `/run`.

**Home** (`/`):
- **the header** (adapted from `apps/desktop/gallery/header/header-simple`, on the paper): "Dunlin" in Besley 700 with a small engraved dunlin beside it; Models, Evals, Run it, Report, Releases and Community; a "Get the weights" button in blue. The labels hold a third more on one line (`whitespace-nowrap`); below the width where they all fit, a menu button takes over;
- **the hero (its own, adapted from `apps/desktop/gallery/hero/hero-index` over `models`)**, a sheet in a hairline frame. On wide screens, zone letters A to F run along its top edge and 1 to 4 down its side, in mono, `aria-hidden`.
  - Two spec labels: "Dunlin 3 · open-weights language models · Apache-2.0" at the top, "Sheet 01 of 08" to its right.
  - The headline: "Five open models, small enough to run where you are."
  - Beside it, the statement: "From a 1.6B that fits on a phone to a 62B mixture of experts for a workstation. Weights, data manifest, training code and every eval config, published by fourteen maintainers in ten time zones."
  - Under the statement, **the run strip** on the blueprint ground, its four tabs, the featured model's commands with Copy, and the comment line. Then "Every way to run it" (`/run`) and "Read the model card" (`/models/dunlin-3`).
  - Under them, **the index**: five rows, with "Most people start here" on Dunlin 3.
  - At the index's foot, right, **the title block** (`parts/title-block.liquid`): Rev 3.1 · Released Mar 4, 2027 · License Apache-2.0, weights and code · Trained on 9.4T tokens, 92% public · Checkpoints every 50B tokens · Maintainers 14, in ten time zones.
  - On a phone, each row becomes the number and the name over a two-by-two grid of its figures, and the title block two columns.
- **the heats (its own, over `heats` where `home`, `id="heats"`):** "02 · Heats" in the margin; "Four heats. Same lanes, same harness, our own runs."; "Each heat is one benchmark, run the same way for every lane. Lane 1 is Dunlin 3. The figures are in the table below, and the configs are in the repository." Four heats, two by two on a desktop, each headed "Heat 1 · Knowledge" with its spec ("MMLU-Pro · 5-shot · accuracy, %"), its four lanes Dunlin 3 14B, Dunlin 2 14B, Baseline A 12B and Baseline B 15B; "Run again" and "All nine heats" (`/evals`). Then **Table 1**, "The same figures": a row per heat, a column per lane, the best in bold, and the footnote in Victor Mono's italic: "Our runs, February 26, 2027 · config evals/heats-3.1.yaml · greedy decoding · mean of three seeds. Baseline A and Baseline B are open models of similar size, run by us the same way.";
- **what it's for (adapted from `apps/desktop/gallery/features/features-numbered` over `home-uses`):** "What it's for, and what it isn't.", five ruled rows, each with its numeral, what it does well and a "Not for" line beside it: long documents ("128K tokens in one go"; not for facts you can't check, since it knows nothing after June 2026), writing in nine languages, code in your editor with Dunlin 3 Coder, tool calls and JSON that parses, working offline with no account and no key;
- **the ledger (its own, adapted from `apps/desktop/gallery/comparison/comparison-feature-table` over `openness`, on the cyanotype wash):** "What we publish, line by line.", a row per item marked Published, Partly or Not yet (a full mark, a half mark, a dash, the words beside them) with where to get it: the weights (base and instruct, all five sizes), the training code, the data manifest (9.4T tokens, 92% downloadable), the checkpoints (every 50B tokens), the training logs, the eval configs and raw outputs, the reward model (Not yet, "in 3.2"), and the 8% of data we may not redistribute (listed by source, not shared);
- **the license in plain words** (its own, on the paper): "Apache-2.0, in plain words.", three ruled columns: You may (use it in a product, sell what you make, fine-tune it, share your fine-tune); You must (keep the license and the NOTICE file with the weights, say what you changed); You may not (call your fine-tune Dunlin: the license gives no rights to the name); "Read the license" (`/license`);
- **the blueprint (its own, adapted from `apps/desktop/gallery/cta/cta-dark-panel`, on the blueprint ground with its grid):** the report's cover as a sheet, "Dunlin 3 Technical Report", "The Dunlin maintainers and 212 contributors · March 2027 · 41 pages"; "The blueprint: how Dunlin 3 was made."; "The data, the training run, what went wrong at 6 trillion tokens and how we fixed it, and every eval."; "Read the report" (`/report`) and the BibTeX with Copy;
- **revisions (adapted from `apps/desktop/gallery/blog/blog-date-list` over `releases`):** "Revisions.", the latest three as ruled rows, each with a redline triangle holding its number ("3.1"), its date, its title and its summary; "Every revision" (`/releases`);
- **the people and the compute (its own, adapted from `apps/desktop/gallery/stats/stats-divided-row` and `apps/desktop/gallery/logos/logos-count-grid`):** "Built by 212 people, on their own time.", four figures (14 maintainers in ten time zones, 212 contributors, 3,400 people on the forum, 1,830 fine-tunes on Hugging Face) beside Plate 2, the flock; then "Who paid for the compute.", the sponsors as a ruled ledger, each with what they gave in figures ("1.1M GPU-hours on H200s · 2026–27"), and "Offer compute" (`/community#sponsor`);
- **the footer (its own, adapted from `apps/desktop/gallery/footer/footer-columns`, on the blueprint ground):** a drawing's title block (Project Dunlin · Drawn by the Dunlin maintainers and 212 contributors · Rev 3.1 · Sheet 01 of 08, each page passing its own sheet number), the links from `navigation` with License, GitHub, Hugging Face, the forum and the chat as links, "Release notes by email" to `/community#notes`, and Upstart's credits link.

**Models** (`/models`, with a card per model):
- the sheet's labels ("Sheet 02 of 08") and the title, "Models", with "Five sizes, one license. Every model comes as base and instruct weights; the instruct one is what the commands run.";
- **the index** again, larger, with two more columns, Layers and Released;
- **base or instruct (its own, two ruled notes):** Instruct, "for chat, tools and most uses"; Base, "for fine-tuning and research; it continues text and doesn't follow instructions";
- **which size (adapted from `apps/desktop/gallery/pricing/pricing-comparison-table`):** "Which size for which machine": a column per machine (a phone or Raspberry Pi with 8 GB, a laptop with 16 GB and no graphics card, an 8 GB card, a 12 to 16 GB card, 24 GB, 48 GB and up), and in each the model and file that fit, with a tick or a dash.

**A model card** (`/models/<model>`), a page per record (its own). The record is the card, as on Hugging Face, where a model card is a Markdown file with its fields at the top:
- **its sheet:** "Sheet 02.3 of 08", the name at hero size ("Dunlin 3"), its one line ("The one most people start with: 14B, 128K context, one 12 GB card."), a row of spec cells (parameters, active, context, layers, at 4-bit, license), and **the run strip** with this model's commands built from its fields (`ollama run {{ record.ollama }}`, its Hugging Face path, its GGUF file for llama.cpp, `dunlin-lm chat` with its size), with "Base weights" to its base repository;
- **the files (adapted from `apps/desktop/gallery/services/services-price-list` over the record's `files`):** each file a name with a dotted leader to its size ("Q4_K_M ........ 8.9 GB · most people"; Q8_0 15 GB; BF16 28 GB), each to its download page;
- **runs on (its own):** the machine's photo on vellum, "One 12 GB graphics card", and what it needs in memory at each precision;
- **the card:** the body in a reading column (intended use, out of scope, training, evaluation with its table, limitations and risks, citation), with a sticky contents list beside it on a desktop; on the featured model, the home page's heats above its evaluation;
- **other sizes:** the index, compact, without this row.

**Evals** (`/evals`):
- the title, "Evals", and "Nine heats in two groups: what it can do, and how fast it does it on ordinary hardware. Every figure is our own run; every config is in the repository.";
- **the lanes (its own):** the four contenders, each with its pattern and a line: Dunlin 3 14B (this release), Dunlin 2 14B (our previous release, 2026), Baseline A (an open 12B model), Baseline B (an open 15B model);
- **quality (the heats, over `heats` where `group` is quality):** knowledge, math, code, long documents, following instructions, nine languages and tool calls, seven heats;
- **speed (the heats, where `group` is speed):** tokens per second at 4-bit on one 12 GB card, and time to first token for a 4K-token prompt. The latter is marked "↓ lower is better", so its shortest bar finishes first;
- **Table 1** with every heat, and its footnote;
- **how we run them (its own, a ruled list):** the harness and its version, the settings, the decoding, three seeds and their spread, the contamination check ("every benchmark against our training data, 13-word overlaps; flagged items removed and counted");
- **rerun them yourself:** the run strip with one tab, `dunlin-lm evals run --config evals/heats-3.1.yaml`, and "The raw outputs of every lane are in the repository";
- **questions** (adapted from `apps/desktop/gallery/faq/faq-accordion` over `evals-faq`): Why not name the baselines? Why these benchmarks? Are the figures from the instruct or the base model? Can I send you a heat to add?

**Run it** (`/run`):
- the title, "Run it", and "On your own machine, with no account and no key. Pick the way you already use.";
- **the run strip, every way (over `runtimes`):** Ollama, Python (`pip install dunlin-lm`), Hugging Face, llama.cpp, LM Studio and a server in a container. Each tab has its command, its comment and a few lines of notes;
- **from zero to a first answer** (adapted from `apps/desktop/gallery/steps/steps-numbered-line` over `run-steps`): install, pull the weights, ask, serve it to your other tools;
- **what it prints first (its own):** `dunlin-lm chat`'s opening in a `<pre>` on the ground, a small dunlin in ASCII art over "Dunlin 3 14B · 4-bit · ready"; the art is `aria-hidden`, captioned "What `dunlin-lm chat` prints when it starts";
- **check your download (its own):** each file's SHA-256 in mono with Copy, and the command that checks it;
- **questions** (adapted from `apps/desktop/gallery/faq/faq-by-topic` over `run-faq`), by topic: Hardware (Will it run on my Mac? Do I need a graphics card?), Files (What does Q4_K_M mean?), Privacy (Does it send anything anywhere? No).

**The report** (`/report`):
- **the cover sheet (its own):** "Dunlin 3 Technical Report", "The Dunlin maintainers and 212 contributors", "March 2027 · 41 pages · revision 3.1", "Download the PDF (3.1 MB)" and "On arXiv";
- **the abstract** in a reading column;
- **contents (its own, over `report-sections`):** the report's sections as a numbered index with their page numbers, like the hero's;
- **figures (its own):** Fig. 1, "The data, by source", one stacked bar of `data-mix` (openly licensed web text 54%, permissively licensed code 19%, math and science 10%, public-domain books and papers 8%, the nine languages' web 7%, synthetic text made by Dunlin 2 and published 2%), each share labeled, static, in the heats' patterns; Fig. 2, two heats from `heats`;
- **who did what** (adapted from `apps/desktop/gallery/team/team-bio-rows` over `report-credits`): the contributors by area (pretraining, data, post-training, evals, infrastructure), names only;
- **cite it:** the BibTeX on the ground with Copy.

**Releases** (`/releases`, with a page per revision):
- the title, "Revisions", and "Every release since 1.0, newest first. Old weights stay downloadable.";
- **the revisions (adapted from `apps/desktop/gallery/blog/blog-date-list` over `releases`):** five rows (3.1, March 4, 2027; 3.0, December 2, 2026; 2.5, August 19, 2026; 2.0, April 7, 2026; 1.0, October 14, 2025). Each has its redline triangle, its date, its title, its kind (major, minor, fix) and its summary;
- **release notes by email** (adapted from `apps/desktop/gallery/newsletter/newsletter-compact-strip` over `newsletter`): "One email per revision, nothing else." Answered by `newsletter-thanks`.

**A revision** (`/releases/<release>`), a page per record (its own): the triangle and the number, large, with the title and the date; "What changed" as a ruled list; the upgrade command with Copy; the notes in a reading column; the previous and the next revision.

**License** (`/license`):
- the title, "License", and "Weights and code under Apache-2.0. The training data keeps its own licenses, listed in the manifest.";
- **in plain words (its own):** the three columns of the home page, longer;
- **using it in a product** (adapted from `apps/desktop/gallery/faq/faq-two-columns` over `license-faq`): Can I sell an app built on it? Do I have to publish my fine-tune? Who owns what it writes? Can I call my fine-tune Dunlin-something?
- **the full text:** the license in a reading column, folded in a `<details>` that is open from 1024 px.

**Community** (`/community`):
- the title, "Community", and "Fourteen maintainers, 212 contributors, ten time zones. Here is where we talk and how to join in.";
- **where we talk** (adapted from `apps/desktop/gallery/features/features-split-list` over `channels`): the forum (where RFCs are decided), the chat, GitHub Discussions, the mailing list, and the office hours, an open video call every other Thursday at 16:00 UTC;
- **how to contribute** (adapted from `apps/desktop/gallery/steps/steps-numbered-line` over `contribute-steps`): pick an issue labeled "good first issue" and say you're on it; read CONTRIBUTING.md; open a pull request; a maintainer in your time zone, or the next one, reviews it within five days;
- **the maintainers (its own, the time-zone ruler, over `maintainers`):** a ruled scale from UTC−8 to UTC+9 on the graph paper, each maintainer a mark at their offset with their initials in Besley on vellum, their name, their area and their city; eight are shown, and "and six more" links to the full list on GitHub. On a phone it becomes a list sorted by offset, the offset in mono;
- **how decisions are made (its own, three ruled notes):** RFCs open for two weeks, the steering group of five, the quarterly accounts;
- **compute and money (the ledger of the home page, over `sponsors`),** then **offer compute or funding** (adapted from `apps/desktop/gallery/forms/forms-contact-card` over `sponsor-offers`, `id="sponsor"`): the organization, your name, email, what you can give (compute, funding, storage or bandwidth, something else), how much, and a message; "Send the offer", and "A maintainer on the steering group answers within a week"; answered by `sponsor-offers-thanks`;
- **release notes by email** (`id="notes"`, the strip of the releases page).

**Datasources:**
- `navigation`;
- `models` (the template's own): name, line, `params`, `active`, `context`, `layers` (a number), `q4`, `bf16`, `runs_on`, `tokens`, `cutoff`, `languages` (a list), `ollama`, `hf`, `gguf`, `base_hf`, `files` (links: a file's name and size, and its address), `hardware` (an image), `featured` (a boolean), `released` (a date), and the card as the body; five records, in order;
- `heats` (the template's own): name, benchmark, setting, unit, `better` (a choice: higher, lower), `scale` (a number, the track's full length), `ours`, `earlier`, `baseline_a`, `baseline_b` (numbers), `group` (a choice: quality, speed), `home` (a boolean), config (a link); nine records, whose figures are invented placeholders (knowledge 61.8, 54.2, 58.9 and 57.1, and so on, the model leading each);
- `runtimes`: label, command, comment, notes, `home` (a boolean); six;
- `openness`: item, `status` (a choice: published, partly, not yet), where (a link), note; eight;
- `releases`: title, `rev`, date, `kind` (a choice: major, minor, fix), summary, `changes` (a list), `upgrade` (the command), and the notes as the body; five, sorted `-date`;
- `maintainers`: name, pronouns, area, city, `utc` (a number of hours), photo (optional); eight, sorted `utc`: Hollis Grant (Seattle, −8), Mathilde Roy (Montréal, −5), Ines Carvalho (Lisbon, 0), Tomiwa Adeyemi (Lagos, +1), Amani Njoroge (Nairobi, +3), Priya Raman (Bengaluru, +5.5), Wen-Hsin Lo (Taipei, +8), Jae-won Park (Seoul, +9);
- `sponsors`: name, `gives` (a choice: compute, funding, storage), what (the figure), period, link; four, and a line for the monthly donors;
- `home-uses`, `report-sections`, `report-credits`, `data-mix`, `run-steps`, `contribute-steps`, `channels`, `evals-faq`, `run-faq` and `license-faq`;
- `sponsor-offers`, collected: organization, name, email, gives, amount, message; answered by `sponsor-offers-thanks`;
- `newsletter`, collected: email, and the sizes you care about (a list with choices); answered by `newsletter-thanks`;
- no page shows the collected records, so neither has test records.

## Getting it, and what stays outside

Upstart has no checkout, no embeds and no fetching of another site's data, so:
- **the weights are links:** every download goes to where the project hosts them (Hugging Face, as built); the template holds no weights and no PDF. The report's "Download the PDF" and "On arXiv" are addresses the agent asks for;
- **the figures are typed facts:** the downloads, stars, contributors and fine-tunes are written in the records. No counter is fetched from GitHub or Hugging Face; the guide says to ask for them and to date them, or to remove them;
- **no chat box and no playground:** a project with a hosted demo links to it ("Try it in your browser"), never embeds it;
- **the forum, the chat and the office hours are links;** no Discord or forum widget;
- **sponsorship is a request:** the form reaches the steering group. Money given through a fiscal host goes by a link to its page (see What varies);
- **the checksums and the license text** are the project's own, typed in; the agent asks for them rather than inventing a hash.

## What varies

The choices the agent asks when the maker's messages leave them open, page type by page type, the recommended one first. The sizes and their figures, the commands and paths, the eval results, the revisions, the people and the sponsors are facts: the agent asks for them once the page is built, or leaves them out rather than guess. It never invents a repository path, a package name or a hash, any of which could belong to someone else.

### Home (`/`), with the choices for the whole site

#### What does the first screen list?
- **The sizes, each with its figures** (as built): the index over `models`, and a card per model.
- **What it does, each with a figure:** for a project with one thing to install (a library, a command-line tool).
  - The index lists `home-uses`, each with its figure: "0 dependencies", "12 kB gzipped", "3 ms cold start".
  - The run strip stays; `/models` and its record pages go.
- **Its packages or parts:** for a monorepo, a database with its drivers, or a framework with its plugins.
  - The index lists a `packages` collection: name, version, size, license and what it is, each linking to its README.
  - The model cards' page becomes `/packages` with the same record page.

#### What do the heats compare?
- **This release against its predecessor and two unnamed baselines** (as built).
- **Your own releases only:** the lanes become 3.1, 3.0, 2.5 and 2.0 of the same size, all striped but the newest; no outside project appears.
- **Named projects, from your own published runs:** the lanes take the names the maker gives, with the figures from their own runs only. Each heat's footnote links to the config of that run. The agent never takes a figure from memory, a paper or another site, and keeps "Our runs" in every footnote.

The template's figures are placeholders and never stay: the agent asks for the maker's results, heat by heat, or removes a heat. A heat with fewer than two lanes is removed, since it races nothing.

#### How do people get it?
- **A command to copy, in tabs** (as built).
- **Gated weights:** for a model whose license must be accepted first.
  - The run strip opens on "Accept the license on Hugging Face", a link to the repository, with the commands under it.
  - The hero's title block says "License: accept on Hugging Face".
- **Downloads per platform:** for an app or a command-line tool with installers.
  - Buttons for macOS, Windows and Linux, each with the file's size and its checksum.
  - The tabs keep the package managers (Homebrew, winget, apt).

When adapting:
- Dunlin's name appears in the header, the hero's headline and labels, the title block, the footer's title block, every lane's name, the commands and the report.
- The figures of "Built by 212 people" and the sponsors' lines are invented: the agent asks for the real ones, with their date, or removes the figures and the ledger.
- The maintainers' time zones come from the people themselves.

### Models (`/models`, with the model cards)

#### A page per model?
- **Yes, a card each** (as built).
- **The index only:** for a project with one or two models. The rows are no longer links, the files move to `/run`, and the record pages go.

#### Do you publish quantized files?
- **Yes, several precisions per model** (as built): the "At 4-bit" column, and the files list with its sizes.
- **Full precision only:** the column becomes "On disk", each card's files list is one line, and the machines table is read at full precision.

When removed: delete `pages/models/`, `data/models/` and its navigation record. The home page's index keeps its rows without links, or lists what the project does (see above). Point "Read the model card" to `/run`.

### Evals (`/evals`)

#### What do the heats measure?
- **Quality and speed** (as built): the two groups.
- **Quality only:** the speed group and its heats go.
- **Speed only:** for a library, a command-line tool or a database. The heats race operations per second, latency, memory or install size; `group` goes; the method section speaks of the machine and the runs.

#### How are the figures shown?
- **The heats, then the table** (as built).
- **The table only, with still bars:** for a maker who would rather not animate their results. Each cell of Table 1 gets a thin bar of its figure; `data-heats`, the "Run again" buttons and `scripts/heats.js` go, on every page.

When removed: delete `pages/evals.liquid`, `data/evals-faq/` and its navigation record. "All nine heats" goes from the home page, and the home page's heats and Table 1 stay.

### Run it (`/run`)

#### Where do people run it?
- **On their own machine** (as built): the six tabs, the machines, the checksums.
- **On their own machine, or on the project's hosted endpoint:** a "Hosted" tab with a `curl` call to the project's own API and a line on its limits. The agent asks for the address and never invents a key.
- **On their own servers:** the tabs lead with the container and an inference server, the machines table becomes a GPU table, and a "Serving" section is added (adapted from `apps/desktop/gallery/steps/steps-numbered-line`).

When removed: delete `pages/run.liquid`, `data/runtimes/` (keeping the home page's records in the hero), `data/run-steps/`, `data/run-faq/` and its navigation record. Point "Get the weights" and "Every way to run it" to the featured model's card.

### The report (`/report`)

#### How many papers?
- **One technical report, its page** (as built).
- **Several papers:** a `papers` list (adapted from `apps/desktop/gallery/blog/blog-date-list`), each with its title, authors, date and a link to its PDF or arXiv page, in place of the cover and the contents; the figures section goes.

When removed: delete `pages/report.liquid`, `data/report-sections/`, `data/report-credits/`, `data/data-mix/` and its navigation record. The home page's blueprint band links to the paper's own address, or goes.

### Releases (`/releases`, with the revision pages)

#### A page per revision?
- **Yes** (as built).
- **The log only:** each row links to the project's releases on GitHub, and the record pages go.

When removed: delete `pages/releases/`, `data/releases/` and its navigation record. The home page's revisions go, the title block keeps the latest revision as text, and the release-notes strip moves to `/community`.

### License (`/license`)

#### What kind of license?
- **A permissive license, in plain words** (as built): Apache-2.0, MIT or BSD.
- **A license with conditions:** for an acceptable-use policy, a threshold of users or revenue, or a research-only clause.
  - "You may not" grows.
  - A line on every model card and in the title block says "Dunlin License 1.0: see the conditions".
  - The questions explain the threshold.
- **A license per model:** a `license` field on `models`, shown in the index and on each card; the page lists each license in turn.

When removed: delete `pages/license.liquid`, `data/license-faq/` and its footer link; the home page's three columns stay, and "Read the license" points to the LICENSE file in the repository.

### Community (`/community`)

#### Where do people talk?
- **A forum and a chat** (as built), with the office hours.
- **GitHub Discussions only:** the channels become one, with the issues and the mailing list; the office hours go unless the maker holds them.

#### Do you take compute or money?
- **Both, through the form** (as built): the ledger and the form.
- **Money through a fiscal host, compute through the form:** a "Give monthly" link to the fiscal host's page joins the ledger; the form asks for compute only.
- **Neither:** the ledger stays as thanks, and the form, `data/sponsor-offers/` and its fragment go.

When removed: delete `pages/community.liquid`, `data/channels/`, `data/contribute-steps/`, `data/maintainers/`, `data/sponsor-offers/`, `fragments/sponsor-offers-thanks.liquid` and its navigation record. The home page's people and compute section stays, its "Offer compute" becomes a `mailto:`, and the footer's "Release notes by email" points to `/releases`.

## Its own blocks

The Blocks tab offers these first for a site started from Heats:

- `hero-heats-index`: the sheet with its labels, the headline, the statement, the run strip, the numbered index of models with its figures, and the title block, a data block over `models`;
- `comparison-heats-heats`: the heats with "Run again" and Table 1 under them, a data block over `heats`, the lanes' names written in the block;
- `features-heats-run-strip`: the run strip, its tabs, the commands with Copy and their comments, a data block over `runtimes`;
- `comparison-heats-ledger`: what is published, item by item, with its marks, a data block over `openness`;
- `logos-heats-sponsors`: the compute and funding ledger with what each sponsor gave, a data block over `sponsors`;
- `team-heats-time-zones`: the maintainers along the UTC ruler, a data block over `maintainers`;
- `blog-heats-revisions`: the revisions with their triangles, a data block over `releases`;
- `footer-heats-title-block`: the footer as a drawing's title block, with the sheet number and the links.

## Images

Few: the template's look is its type, its paper and its bars. There are two generated plates and about seven free photos from Wikimedia Commons and Openverse (CC0, public domain, CC BY, CC BY-SA), credited. None has been searched or made yet; that comes with step 4.

- **Generated, where a drawing serves better than any photo.** The two plates of the mascot are made with `pnpm template:image generate`, the second with `--ref` to the first, so that they read as one hand:
  - **Plate 1** (4:5): "a natural-history engraving of a dunlin, a small sandpiper, standing on wet sand, drawn in fine dark ink lines and cross-hatching on plain white paper, no text, no frame, no color";
  - **Plate 2** (16:9): "a flock of dunlins wheeling in flight over a mudflat, in the same engraving style";
  - they stand on the graph paper with `mix-blend-mode: multiply`, so the grid shows through their white and they read as ink on the sheet with any light palette. They are used in the header's mark, on the community section, on the report's cover, and where a model card has no machine photo;
  - they show no person, no logo and no text. Generated images make the template need `"app": "0.2.0"` in `template.json`.
- **The machines**, five photos, one per model's `hardware`: a Raspberry Pi 5 board, a phone lying flat, a laptop open on a desk, a graphics card on its own, a workstation tower. They are chosen in plain light on a plain ground, cropped on vellum, without a visible brand mark where a photo allows. Without a fitting one, the card shows Plate 1 and the line "Runs on" in words.
- **The dunlin itself**, two photos: a flock in flight over a mudflat at low tide, and one bird feeding at the water's edge, for the community page's head. Commons has many, under CC BY-SA.
- **The people:** no portraits. Each maintainer's initials stand in Besley on a vellum square until the maker sends photos.

They are chosen cool and clear, daylight over water and plain hardware, with no glow, no screens showing interfaces, no circuit-board macro shots as decoration, and no stock "AI" imagery. No filter is applied: the paper, the grid and the ink pull them together.
