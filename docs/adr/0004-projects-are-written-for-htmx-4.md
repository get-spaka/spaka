# Projects are written for htmx 4

htmx 4.0.0 was released on 2026-08-28, but npm's `latest` tag stays on 2.x until early 2027 and coding agents know htmx 2 far better. We generate every project for htmx 4 anyway: a project lives for years and should not start on the outgoing major, and morph swaps and status-code-based response handling are built into the htmx 4 core instead of coming from extensions.

## Consequences

- The agent is given an htmx 4 cheat sheet. In the live-generation spike, with the official `htmx-2-compat` extension off, all 135 htmx attributes it wrote were valid htmx 4 and all 20 forms worked ([report](../spikes/live-generation.md)). Projects therefore do not load that extension.
- Only the attributes a form needs were exercised (`hx-post`, `hx-target`, `hx-swap`, `hx-status`, `hx-disable`, `hx-on`). `hx-get`, triggers, boosting and inheritance were not.
- Extensions come from the htmx 4 core set only (`hx-preload`, `hx-pending` and `hx-head` by default, `hx-sse` on demand). The htmx 2 community extensions have no htmx 4 equivalent yet.
