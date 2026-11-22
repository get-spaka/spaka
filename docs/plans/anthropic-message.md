# Message to Anthropic: subscription sign-in in Upstart

## État (2026-11-22) : rédigé le 2026-11-19, pas encore envoyé

Matt l'envoie avant la 0.2.0, qui est mise de côté (tranche 6 du plan [distribution](distribution.md)).

To send before 0.2.0 is distributed (ADR 0002, Q371). Where to send it: Anthropic's sales / partnerships contact (https://www.anthropic.com/contact-sales) or the Claude Code team's contact if you have one. Fill in the bracketed parts.

---

**Subject:** Approval request: Claude subscription sign-in in Upstart, an open-source desktop app built on the Claude Agent SDK

Hello,

I'm [your name], the maker of Upstart (https://github.com/upstart-gg/upstart-editor), a free, MIT-licensed desktop app for macOS and Windows that lets people build websites by talking to an agent on their own computer. Upstart drives Claude through the Claude Agent SDK, which runs your published Claude Code binary, unmodified.

I'm writing to ask for approval to let Upstart's users sign in with their own Claude subscription, as the Agent SDK documentation asks third-party developers to do.

How Upstart uses Claude today:

- Upstart ships and runs the official binary exactly as published (its signature is kept as Anthropic's) and never shows a claude.ai login of its own. A user signs in through the binary's own sign-in flow, in their browser, or enters an API key, or uses Bedrock or Vertex credentials.
- Upstart never reads, stores, proxies or transmits the user's tokens. The binary keeps its sign-in in a configuration folder of Upstart's own, separate from the user's own Claude Code setup.
- API key sign-in always works on its own, and subscription sign-in can be removed in a single release without affecting anything else.
- The product never uses the "Claude Code" name or visuals; it says "Claude" and "Powered by Claude", per your branding guidelines.
- There is no Upstart account, no server of ours in the loop, and no resale: each user's usage draws from their own plan's limits, as your support article on using the Agent SDK with a Claude plan describes.

Why it matters: Upstart is for semi-technical makers (small businesses, freelancers, associations) who often already pay for a Claude plan. Using that plan, rather than a separate per-use API bill, is what makes a local, free, open-source tool practical for them.

Our first public version (0.2.0) is about to ship with subscription sign-in enabled alongside API keys. If you would rather we offer API keys only until you approve, or need anything changed in how sign-in is presented, tell us and we will follow your answer in the next release.

Thank you for considering it. I'm happy to share builds, the code paths involved, or anything else useful.

Best regards,
[your name]
[contact email]
