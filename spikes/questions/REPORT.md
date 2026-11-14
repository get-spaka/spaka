# Probe: the agent's questions and plan mode in the Agent SDK

2026-11-14, slice 0 of the build plan for Q282-Q296 (`~/.claude/plans/agent-questions.md`). Agent SDK 0.3.321 with its own binary, Sonnet at effort low, signed in as the real-agent checks are (`.cache/agent-config`), in a throwaway folder: `node spikes/questions/probe.ts <ask|plan|wait|resume>`, logs in `spikes/questions/runs/` (not kept in git).

## Questions

- AskUserQuestion reaches `canUseTool` in `acceptEdits`, the mode the app runs in on macOS, once it is in `tools`. The binary announces `ask_user_question_unanswered_v1`.
- Two questions at once, one of them multi-select: `{ behavior: "allow", updatedInput: { questions, answers } }` with a label for one and an array of labels for the other. The agent reads `"Which main color…?"="Option A", "Which pages…?"="Home,Contact"`.
- The maker's own words for the whole card: `answers: {}` and `response: "…"`. The agent reads `The user responded: …` and acts on it.
- Skip: `answers: {}` and `annotations: { [question]: { unanswered: "skipped" } }`. The agent reads `The user did not answer the questions.`, decides by itself and says so.
- Previews: asked for `block:hero-split` and `media/shop.jpg`, Claude put exactly these in `preview` (with `previewFormat: "markdown"`).
- Claude writes "(Recommended)" at the end of the label it recommends, first among the choices. The card takes it off the label and marks the choice.
- A question answered after 5.5 minutes (with `dialogExpiry: "never"` in the settings) was taken as any other: the agent wrote the answer at 333 s. Nothing timed out.

## Plan mode

- `ExitPlanMode` must be in `tools`, as AskUserQuestion: otherwise the agent is told "No such tool available: ExitPlanMode".
- In plan mode Upstart's tools reach `canUseTool` even when `allowedTools` names them (with `useAutoModeDuringPlan: false`): the app allows those that only read (find_blocks, find_images, look_at_preview, and the web's) and refuses the others. No PreToolUse hook is needed. The agent did not call use_block by itself in plan mode, since it writes.
- The agent writes its plan in a file of its own, `<CLAUDE_CONFIG_DIR>/plans/<words>.md`, in Upstart's agent data, then calls ExitPlanMode. `canUseTool` gets `{ plan, planFilePath }`: the plan's text is in the call, nothing needs reading.
- Changes in the maker's words: a refusal whose message carries them. The agent rewrote its plan (a wedding-cakes page added) and handed it in again at once.
- Build: `await q.setPermissionMode("acceptEdits")` inside `canUseTool`, then `allow`. The agent reads "User has approved your plan. You can now start coding…" with the plan, and builds in the same turn: index.html written with the four pages.
- The plan-mode instructions given by `planModeInstructions` were followed: pages and sections, style, what is invented, short.

## The app closed while a question waits

- Closing the query while `canUseTool` waits aborts its signal. Resumed, the session holds the question as rejected: the agent says "the question was rejected and never answered". Nothing else is needed for Claude; the card shows "Not answered".

## Cost

- The `total_cost_usd` of the first turn of `ask` (1.67) was taken while the account's own claude.ai connectors loaded (the probe had no `strictMcpConfig` yet, as the app has). With it, a plan turn reports $0.07 and a resumed turn $0.01.
