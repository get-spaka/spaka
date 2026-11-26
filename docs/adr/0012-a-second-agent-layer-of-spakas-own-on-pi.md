---
status: accepted (2026-11-14, Q268); designed from Q269 (files through tools only, Q271); what it said of ACP corrected by spike 4 (2026-11-26)
---

# Other models run in a harness of Spaka's own, built on Pi's libraries, beside Claude's

Spaka's agent layer has one interface and two adapters:

1. **Claude, through the Agent SDK** and the unmodified official binary, as before ([ADR 0002](0002-claude-runs-through-the-unmodified-official-binary.md)): a Claude subscription or an Anthropic key.
2. **A harness of Spaka's own on Pi's libraries** (`pi-ai` for the models, MIT), for every other model: ChatGPT Plus or Pro through "Sign in with ChatGPT", OpenAI's program for apps, and the maker's API keys, a Gemini key from AI Studio first.

In that harness the model writes files through tools, as Claude does, never in its reply's text (Q271): OpenAI streams a tool call's arguments as the model writes them, and Gemini, which sends a call whole on the Gemini API, gets a way of its own to keep the live preview (Q273). Its file tools reach the project alone, through an execution environment Spaka provides.

Spike 3 ([report](../spikes/harnesses.md)) tried Codex, opencode, Pi, Gemini CLI and Antigravity. The live preview needs a file's content while it is written:
- Codex passes on nothing of what its code mode writes;
- opencode publishes a tool's input only once complete;
- the Gemini API carries a tool call only whole, and so did Gemini CLI and Antigravity, the two agents tried over ACP.

ACP itself does not stand in the way, contrary to what this record first said: a call's input may be sent again as it grows while the call is `pending`, and an adapter that does so gives the live preview over ACP ([spike 4](../spikes/acp.md)).

Pi streams a tool call's arguments as OpenAI sends them: GPT-6.1 Sol's page grows from 6 s, as Claude's does. The spike also had the model write its files in its reply's text, which every provider streams; Matt turned that down (Q271).

## Considered options

- **Ready-made agents, installed by the maker** (Antigravity or Codex, driven over ACP or their own protocol). It would settle the licence, since Spaka would ship nothing, but it opens no subscription:
  - Antigravity's terms forbid an app to drive it on a Google sign-in, even unmodified;
  - Codex gives no live preview;
  - the maker's install updates itself out of Spaka's hands.
- **Pi in front of the vendors' agents**. Two nested agent loops: the preview would still be decided by the agent underneath, and the subscription by its terms.
- **Every account through Pi, Claude's included**. Pi's Claude sign-in passes itself off as Claude Code, which Anthropic forbids and Spaka's rule excludes.
- **Claude only**. The simplest, but a maker without a Claude subscription pays per use for Claude alone.

## Consequences

- Two agent layers to keep:
  - instructions and checks per model family;
  - each harness's stream adapted to the preview's events, with Spaka's canonical tool kinds (write, edit, shell) in between.
- Spaka holds credentials for the second layer: the maker's API keys, and the tokens of Sign in with ChatGPT, which Pi's libraries obtain under Spaka's own name. Claude's sign-in stays the official binary's alone.
- Sign in with ChatGPT admits open-source apps; Spaka v2 is open source under MIT. Whether OpenAI admits it shows at the first sign-in under Spaka's name.
- Google offers apps no route to a Google AI subscription: Gemini means the maker's key, billed by Google Cloud, a paid one in the EEA.
- Spaka does for the Pi harness what the official binary does for Claude: the shell's sandbox (Q278), the connectors and their OAuth sign-in (Q277), the web search through the provider's own (Q276).
- Gemini keeps the live preview through tools: a long file in several calls on an AI Studio key, or the arguments streamed on Vertex AI (Q273).
- An ACP adapter can be added later if a vendor's agent brings what Pi does not.
