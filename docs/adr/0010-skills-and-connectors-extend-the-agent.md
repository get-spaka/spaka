---
status: accepted; skills and connectors built and checked with the real agent on 2026-11-10
---

# Skills and connectors extend the agent; a connector that launches a local program runs outside the sandbox, by approval

The agent starts with nothing of the maker's own Claude installation: none of its connectors, skills, plugins, memory or settings. What extends it comes through Upstart: the skills Upstart ships, and the skills and connectors the maker adds, either for the whole app or for one project. Those of a project are kept in its folder and travel with it. Skills follow the open Agent Skills format. The app itself (its interface, its builders) has no plugin system.

The agent is isolated because inheriting costs too much and makes a project behave differently from one machine to the next. In the live-generation spike, an agent that inherited the maker's claude.ai connectors took 1.8 s to start instead of 0.4 s and carried 215,000 tokens of tool definitions ([report](../../spikes/live-generation/REPORT.md)).

A project received from someone else can carry skills and connectors, and the three kinds do not carry the same risk. A skill's scripts run through the agent's shell, so inside the sandbox. A remote connector receives only what the agent sends it, which stays within what [ADR 0007](0007-agent-has-a-shell-in-auto-mode-inside-the-os-sandbox.md) already accepts: the project can leak, nothing else. A connector that launches a local program is different: the sandbox covers shell commands only, so that program runs with the maker's full access. A project's skills and remote connectors therefore load without asking, and a local-program connector found in a project stays off until the maker approves it once on that machine, the app showing the command it would run.

## Considered options

- **Local-program connectors at app level only**: nothing to approve when a project opens, and ADR 0007's guarantee stays whole for a received project. Rejected: a project should be able to carry everything it needs.
- **Approve everything once**, skills and remote connectors included: one more question for no risk the sandbox does not already contain.
- **Load everything automatically**: opening a received project could run a program outside the sandbox.
- **Inherit the maker's Claude setup**: makers who already use Claude would find their tools, at the cost measured above.

## Consequences

- This is the one place where Upstart asks a maker to judge a command, which ADR 0007 says they cannot be expected to do. It happens when a project opens or a connector is added, never while the agent works.
- The approval is kept outside the project folder and tied to the exact command. The agent can write in the project folder; without this it could add or alter a connector and have it run.
- For a maker who approves a local-program connector, ADR 0007's guarantee weakens: a misled agent can use that connector's tools with whatever access the program has.
- A connector's secrets (a token, a key) go in the system keychain, never in the project's files. A received project arrives without them.
- The agent can write a skill into the project when the maker asks for one. It gets it with the maker's next message: the agent starts again with its skills, resuming the conversation.
- The agent's kit loads skills only through plugin folders. Upstart assembles them in its own data, one per origin, from skill folders only (regular files, no links), and enables those skills by name. The agent can read that folder, its shell can run a skill's scripts inside the sandbox, and nothing can write there. The binary still lists its own built-in skills when it starts, but the agent is not offered them and launching one is refused (checked with the real agent).
- Auto mode let the agent call a connector's tool that only reads (checked with the real agent). A call with effects elsewhere (sending, deleting) has not been tried.
- The agent starts again with its connectors when one is added, removed, turned on or given a secret, resuming the conversation, as for skills.
- A remote connector that asks the maker to sign in (OAuth) is shown as such and stays unusable: Upstart cannot run that sign-in yet.
