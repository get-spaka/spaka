// The app's own update, once downloaded (Q378): a line at the sidebar's foot,
// above Settings, with Restart, until the app restarts; while the sidebar is
// hidden, a dot on the button that shows it.
import { PanelLeft } from "lucide-react";
import { useUpdate } from "../hooks/useMain";
import { upstart } from "../lib/bridge";
import { t } from "../lib/strings";
import { Button } from "./ui/button";

export function UpdateNote() {
  const update = useUpdate();
  if (update.state !== "ready") return null;
  return (
    <div data-testid="update-note" className="mb-1 flex items-center gap-2 rounded-md bg-primary/10 py-1 pr-1 pl-2.5">
      <span className="min-w-0 flex-1 truncate text-xs font-medium">{t.sidebar.updateReady}</span>
      <Button
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={() => void upstart.invoke("app:restart-to-update")}
        tip={t.sidebar.restartTip(update.version)}
        tipSide="right"
        data-testid="update-restart"
      >
        {t.sidebar.restart}
      </Button>
    </div>
  );
}

/** The button that shows the hidden sidebar, with a dot when an update is ready. */
export function ExpandSidebarButton({ onClick }: { onClick: () => void }) {
  const ready = useUpdate().state === "ready";
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="no-drag relative"
      onClick={onClick}
      tip={ready ? t.sidebar.expandUpdate : t.sidebar.expand}
      command="sidebar"
    >
      <PanelLeft />
      {ready && <span data-testid="update-dot" className="absolute top-1 right-1 size-1.5 rounded-full bg-primary" />}
    </Button>
  );
}
