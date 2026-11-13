---
status: accepted; confirmed on macOS by the live-generation spike; auto mode dropped on macOS on 2026-11-13 (Q221). The confinement on Windows and Linux, and the cost of auto mode under an API key, are not verified
---

# The agent has a shell and is confined by the operating system's sandbox

The agent never asks the maker for permission. It has every tool it needs, a shell included. The operating system's sandbox confines it: it writes only in the project folder and the system's temporary folder, and reads only those two plus the system files its commands need. Its shell commands reach the network freely. On macOS, where the sandbox was shown to hold on its own, the app grants every command run inside it and refuses anything else without asking (Q221); elsewhere the agent runs in its auto mode, where a classifier judges each risky action, and what auto mode blocks is refused.

Makers are semi-technical and cannot be expected to judge a shell command, so a prompt protects nothing; the confinement does. A shell is what lets the agent convert images, run a script over fifty files or fetch a library. Reading nothing outside the project is what makes the open network tolerable: an agent misled by a hostile web page can leak the project and nothing else.

## Considered options

- **No shell, file tools only**: identical on every operating system and nothing to sandbox, but the agent loses scripts, conversions and bulk operations.
- **Shell without network, or with a fixed list of allowed hosts**: no command could download and run a program or send files anywhere. Rejected as too limiting.
- **No shell where the sandbox is missing**: the same guarantee everywhere, at the price of a weaker agent on Windows and on some Linux machines.
- **Asking the maker after repeated blocks**, which is what the agent tool does by default: the maker cannot judge the request.

## Consequences

- macOS has the sandbox built in, and the live-generation spike showed the confinement holds there ([report](../../spikes/live-generation/REPORT.md)). On native Windows, and on Linux without bubblewrap and socat, shell commands run unconfined with the network open: there the write and read limits hold for the file tools only, and auto mode is the only guard on commands. Those platforms ship as beta, and none of this has been tried on them. On macOS with the sandbox switched off, the read limit made the agent tool refuse most scripted commands.
- Files the maker attaches in the conversation are copied into the project, since the agent cannot read them where they are.
- Tools installed under the maker's home folder are out of reach for the same reason: a Node from a version manager, npm, the maker's git configuration. The agent's shell has the system's own tools plus the Node embedded in the app, without npm, and git does not work for it. Whether the app's Node can be offered to the shell this way is to be verified when building.
- Auto mode added about one second to each shell command, and it was no boundary: in the spike its classifier let a downloaded script run in 4 tries of 6, inside the sandbox. The agent tool also refuses, without auto mode's say, commands it cannot place statically, a `cd` joined to a write (`cd data && rm team/x.md`) or an `rm` among several commands; with no one to approve them they failed, and in the "Gallery v2" check the agent kept six sample records as six more team members (Q220). A probe with the real agent then showed the sandbox alone holding on macOS: the home folder neither readable nor writable, the login keychain refused, only the network open (`e2e/agent-sandbox.e2e.ts`). So on macOS auto mode is off (Q221): files in the project and the temporary folder are written without asking, and a PermissionRequest hook grants every shell command run in the sandbox, a connector's tool and a skill; a file tool asks only to write outside the project, and is refused. The shell returns to the project folder after each command. What the open network still allows, an agent misled by a hostile page sending the project's files elsewhere, auto mode guarded only weakly.
- Elsewhere auto mode stays, since commands run unconfined there. It needs a recent model, and an organisation's administrator can switch it off; where it is unavailable the agent works without a shell, with its file tools only. The agent tool falls back to asking the maker after repeated blocks; the app makes it refuse instead, through a setting of the agent tool, with a handler that refuses as a safety net, and grants nothing there.
- The agent's web tools, WebSearch and WebFetch, are granted for every project in its settings (Q257, 2026-11-13): it reads the web for the maker's own pages, a fact, or current design, as its shell's network already allowed. What it reads there is data; the confinement, not the page, decides what it can reach.
- A connector that launches a local program is not a shell command, so the sandbox does not confine it ([ADR 0010](0010-skills-and-connectors-extend-the-agent.md)).
- For Codex the equivalent is its workspace-write sandbox with approvals turned off and network access turned on. Whether it can also limit reads has not been checked.
