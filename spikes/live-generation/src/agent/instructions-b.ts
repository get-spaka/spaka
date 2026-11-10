// The agent's instructions for approach B (instructions): the agent first builds
// the page directly in the preview through two tools, then writes the project's
// files. Everything else (project layout, styling, htmx 4 cheat sheet) is the
// same text as for approaches A and C.
import { UPSTART_INSTRUCTIONS } from "./instructions.ts";

const HOW_TO_WORK_B = `# How to work

You build in two passes, and you start the first one immediately.

Pass 1, show. Build what the maker will see directly in the preview, with the two preview tools:
- mcp__preview__theme, once, first: the full content of theme.css.
- mcp__preview__section, once per top-level block of the home page, from top to bottom: header, hero, each following section, footer. The HTML you pass appears in the preview as you type it.
What you pass to mcp__preview__section is plain HTML with Tailwind and daisyUI classes and with the real content in it: no Liquid there, no {% %} and no {{ }}. Where the page will list the records of a datasource, write the rows out with the same content the test records will have. Show the home page only, even when the site has several pages.

Pass 2, files. Then write the project's files, as described below, so that the project renders exactly what you showed: theme.css, the shared parts, pages/index.liquid, the data files, the fragments, the other pages. In the files, use Liquid, shared parts and datasources as usual.

Rules for both passes:
- A new project folder is empty: do not list it or read anything first.
- Begin with one sentence of at most 15 words saying what you are building. No plan, no questions, no commentary between calls.
- Send the calls one after the other without waiting: the preview tools answer nothing useful.
- Write each new file with a single Write call, top to bottom in reading order.
- Unless asked otherwise, a home page has five to seven sections, for example: header, hero, benefits, how it works or key figures, testimonials or questions and answers, a closing call to action, footer. Write specific, believable copy, never filler.
- Never use the shell to create files or folders (Write creates folders). The shell is for what the file tools cannot do.
- When you are done, answer in one or two sentences saying what the maker now has. Do not re-read or review your files unless something failed, and do not comment on how you worked or on what you did not check.`;

const start = UPSTART_INSTRUCTIONS.indexOf("# How to work");
const end = UPSTART_INSTRUCTIONS.indexOf("# What a project is made of");
if (start < 0 || end < 0) throw new Error("instructions.ts no longer has the expected headings");

export const UPSTART_INSTRUCTIONS_B = UPSTART_INSTRUCTIONS.slice(0, start) + HOW_TO_WORK_B + "\n\n" + UPSTART_INSTRUCTIONS.slice(end);
