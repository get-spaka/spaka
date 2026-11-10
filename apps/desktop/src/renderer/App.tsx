import { ArrowUp, FolderPlus, PanelLeft, Settings } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/strings";
import { cn } from "@/lib/utils";

/** Height of the title bar strip, where the window can be dragged. */
const BAR = "h-13";

export function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-full">
      {sidebarOpen && <Sidebar onCollapse={() => setSidebarOpen(false)} />}
      <Conversation sidebarOpen={sidebarOpen} onExpandSidebar={() => setSidebarOpen(true)} />
      <Preview />
    </div>
  );
}

function Sidebar({ onCollapse }: { onCollapse: () => void }) {
  return (
    <aside data-testid="sidebar" className="flex w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className={cn(BAR, "drag-region flex items-center justify-end px-2")}>
        <Button variant="ghost" size="icon-sm" className="no-drag" onClick={onCollapse} title={t.sidebar.collapse}>
          <PanelLeft />
        </Button>
      </div>
      <div className="flex items-center justify-between px-3 pb-1">
        <span className="text-xs font-medium text-muted-foreground">{t.sidebar.projects}</span>
        <Button variant="ghost" size="icon-sm" title={t.sidebar.newProject}>
          <FolderPlus />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 text-sm text-muted-foreground">{t.sidebar.noProjects}</div>
      <div className="border-t p-2">
        <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground">
          <Settings />
          {t.sidebar.settings}
        </Button>
      </div>
    </aside>
  );
}

function Conversation({ sidebarOpen, onExpandSidebar }: { sidebarOpen: boolean; onExpandSidebar: () => void }) {
  const [draft, setDraft] = useState("");
  return (
    <section data-testid="conversation" className="flex w-[420px] shrink-0 flex-col border-r bg-background">
      {/* Room for the window's buttons when the sidebar is hidden. */}
      <div className={cn(BAR, "drag-region flex items-center", sidebarOpen ? "px-3" : "pl-20 pr-3")}>
        {!sidebarOpen && (
          <Button variant="ghost" size="icon-sm" className="no-drag" onClick={onExpandSidebar} title={t.sidebar.expand}>
            <PanelLeft />
          </Button>
        )}
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
        <h1 className="text-lg font-semibold tracking-tight">{t.conversation.emptyTitle}</h1>
        <p className="max-w-72 text-sm text-muted-foreground">{t.conversation.emptyText}</p>
      </div>
      <form
        className="p-3"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
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

function Preview() {
  return (
    <main data-testid="preview" className="flex min-w-0 flex-1 flex-col bg-muted/40">
      <div className={cn(BAR, "drag-region border-b bg-background")} />
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
        <h2 className="text-base font-medium">{t.preview.emptyTitle}</h2>
        <p className="max-w-80 text-sm text-muted-foreground">{t.preview.emptyText}</p>
      </div>
    </main>
  );
}
