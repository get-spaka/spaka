---
status: accepted (2026-11-14, Q268); its design follows from Q269
---

# Other models run in a harness of Upstart's own, built on Pi's libraries, beside Claude's

Upstart's agent layer has one interface and two adapters:

1. **Claude, through the Agent SDK** and the unmodified official binary, as before ([ADR 0002](0002-claude-runs-through-the-unmodified-official-binary.md)): a Claude subscription or an Anthropic key.
2. **A harness of Upstart's own on Pi's libraries** (`pi-ai` for the models, MIT), for every other model: ChatGPT Plus or Pro through "Sign in with ChatGPT", OpenAI's program for apps, and the maker's API keys, a Gemini key from AI Studio first.

In that harness the model writes each file in its reply's text, in a `<file path="…">` block, and Upstart takes the files from the text as it streams. Its file tools reach the project alone, through an execution environment Upstart provides.

Spike 3 ([report](../../spikes/harnesses/REPORT.md)) tried Codex, opencode, Pi, Gemini CLI and Antigravity. The live preview needs a file's content while it is written:
- Codex passes on nothing of what its code mode writes;
- opencode publishes a tool's input only once complete;
- the Gemini API and ACP carry a tool call only whole.

Every provider streams a reply's text, though. With files in the text, Gemini 4 Hydrogen at low thinking completes the launch page at 22.5 s in Pi, against 23.6 s for Claude, at about 60% of its API price.

## Considered options

- **Ready-made agents, installed by the maker** (Antigravity or Codex, driven over ACP or their own protocol). It would settle the licence, since Upstart would ship nothing, but it opens no subscription:
  - Antigravity's terms forbid an app to drive it on a Google sign-in, even unmodified;
  - Codex gives no live preview;
  - the maker's install updates itself out of Upstart's hands.
- **Pi in front of the vendors' agents**. Two nested agent loops: the preview would still be decided by the agent underneath, and the subscription by its terms.
- **Every account through Pi, Claude's included**. Pi's Claude sign-in passes itself off as Claude Code, which Anthropic forbids and Upstart's rule excludes.
- **Claude only**. The simplest, but a maker without a Claude subscription pays per use for Claude alone.

## Consequences

- Two agent layers to keep:
  - instructions and checks per model family;
  - the file format checked over whole sessions;
  - each harness's stream adapted to the preview's events.
- Upstart holds credentials for the second layer: the maker's API keys, and the tokens of Sign in with ChatGPT, which Pi's libraries obtain under Upstart's own name. Claude's sign-in stays the official binary's alone.
- Sign in with ChatGPT admits open-source apps; Upstart v2 is open source under MIT. Whether OpenAI admits it shows at the first sign-in under Upstart's name.
- Google offers apps no route to a Google AI subscription: Gemini means the maker's key, billed by Google Cloud, a paid one in the EEA.
- An ACP adapter can be added later if a vendor's agent brings what Pi does not.
