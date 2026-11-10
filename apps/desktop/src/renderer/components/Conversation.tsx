import { ArrowUp, PanelLeft } from "lucide-react";
import { useState } from "react";
import type { ProjectInfo } from "../../shared/ipc";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

export function Conversation({
  project,
  sidebarOpen,
  onExpandSidebar,
}: {
  project: ProjectInfo | null;
  sidebarOpen: boolean;
  onExpandSidebar: () => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <section data-testid="conversation" className="flex w-[420px] shrink-0 flex-col border-r bg-background">
      {/* Room for the window's buttons when the sidebar is hidden. */}
      <div className={cn("drag-region flex h-13 shrink-0 items-center gap-2", sidebarOpen ? "px-4" : "pr-4 pl-20")}>
        {!sidebarOpen && (
          <Button variant="ghost" size="icon-sm" className="no-drag" onClick={onExpandSidebar} title={t.sidebar.expand}>
            <PanelLeft />
          </Button>
        )}
        {project && (
          <span data-testid="project-name" className="truncate text-sm font-medium">
            {project.name}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
        <h1 className="text-lg font-semibold tracking-tight">{t.conversation.emptyTitle}</h1>
        <p className="max-w-72 text-sm text-muted-foreground">{t.conversation.emptyText}</p>
      </div>
      <form className="p-3" onSubmit={(event) => event.preventDefault()}>
        <div className="flex items-end gap-2 rounded-xl border bg-background p-2 shadow-xs focus-within:ring-[3px] focus-within:ring-ring/30">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t.conversation.placeholder}
            rows={3}
            className="max-h-48 flex-1 resize-none bg-transparent px-1 py-1 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Button type="submit" size="icon-sm" disabled={!draft.trim()} title={t.conversation.send}>
            <ArrowUp />
          </Button>
        </div>
      </form>
    </section>
  );
}
