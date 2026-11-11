// The agent's words in the conversation, as Markdown (bold, lists, code,
// tables, links), rendered while they stream in: an unfinished line of
// Markdown shows as it will end, not as raw signs. Sized for the chat.
import type { ComponentProps } from "react";
import { Streamdown } from "streamdown";
import { upstart } from "../lib/bridge";
import { cn } from "../lib/utils";

/**
 * A link of the agent's: an address of the site goes to that page in the
 * preview, a web address opens in the maker's browser; nothing else is followed.
 */
function Link({ href, children, className }: ComponentProps<"a"> & { node?: unknown }) {
  return (
    <a
      href={href}
      data-testid="agent-link"
      className={cn("font-medium text-primary underline underline-offset-2", className)}
      onClick={(event) => {
        event.preventDefault();
        if (!href) return;
        if (href.startsWith("/")) void upstart.invoke("preview:navigate", href);
        else if (/^https?:\/\//i.test(href)) void upstart.invoke("app:open-link", href);
      }}
    >
      {children}
    </a>
  );
}

const COMPONENTS = { a: Link };
const CONTROLS = {
  code: { copy: true, download: false },
  table: { copy: true, download: false, fullscreen: false },
  mermaid: false,
} as const;

export function AgentText({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <Streamdown
      data-testid="agent-text"
      className={cn(
        "space-y-2 leading-relaxed break-words",
        // Headings stay the size of the chat: a message is not a page.
        "[&_h1]:mt-3 [&_h1]:mb-1 [&_h1]:text-base [&_h1]:font-semibold",
        "[&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-sm [&_h2]:font-semibold",
        "[&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold",
        "[&_h4]:text-sm [&_h5]:text-sm [&_h6]:text-sm",
        "[&_li]:py-0.5 [&_ol]:pl-1 [&_ul]:pl-1",
        "[&_pre]:text-xs [&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:text-[0.85em]",
        "[&_table]:text-xs [&_hr]:my-3",
      )}
      components={COMPONENTS}
      controls={CONTROLS}
      linkSafety={{ enabled: false }}
      isAnimating={streaming}
      mode={streaming ? "streaming" : "static"}
    >
      {text}
    </Streamdown>
  );
}
