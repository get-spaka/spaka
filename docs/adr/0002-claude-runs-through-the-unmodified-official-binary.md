---
status: accepted
---

# Claude runs through the unmodified official Claude Code binary; Upstart never touches credentials

Upstart drives Claude through the Claude Agent SDK, which runs Anthropic's published Claude Code binary. The maker signs in through Anthropic's own flow with their subscription, or supplies an API key, Bedrock or Vertex credentials. Upstart never shows a claude.ai login of its own, never reads, stores or proxies tokens, and never restricts the binary's authentication methods.

Subscription sign-in is enabled from the first release, without waiting for Anthropic's approval. Anthropic's documents do not line up on this point, and we knowingly take the risk:

- The [legal and compliance page](https://code.claude.com/docs/en/legal-and-compliance.md) forbids third-party apps from offering claude.ai login or intermediating plan credentials, and states that nothing prevents an end user from signing in to the unmodified Claude Code binary that a product runs.
- The support article [Use the Claude Agent SDK with your Claude plan](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan) says that Agent SDK and third-party app usage draws from the signed-in user's subscription limits.
- The [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview) says that, unless previously approved, third-party developers may not offer claude.ai login or rate limits for their products, agents built on the Agent SDK included, and points them to API keys.

We take the risk because using the subscription a maker already pays for is the main reason to pick a desktop app. We still write to Anthropic to ask for approval; their answer decides whether the subscription path stays.

## Considered options

- **API key only**: the unambiguous path, but every maker then pays per use.
- **Ask first, enable after approval**: no risk of withdrawal, but it holds back the main selling point for an unknown time.
- **Own login flow or token reuse**: explicitly forbidden.

## Consequences

- The binary is shipped and run exactly as published. Running it in a product means accepting Anthropic's Commercial Terms.
- API key authentication must always work as a complete alternative, and subscription sign-in must be removable in a single release without breaking anything else.
- Naming follows the Agent SDK branding guidelines: the agent is called "Claude" or "Claude Agent", and Upstart may say "Powered by Claude". The "Claude Code" name and visuals are never used in the product.
