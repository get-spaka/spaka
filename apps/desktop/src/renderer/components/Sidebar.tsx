import { FolderOpen, PanelLeft, Plus, Settings, SlidersHorizontal } from "lucide-react";
import type { ProjectInfo, ProjectSummary } from "../../shared/ipc";
import { upstart } from "../lib/bridge";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Tip } from "./ui/tip";

export function Sidebar({
  projects,
  waiting = [],
  current,
  onCollapse,
  onNew,
  onSettings,
  onSiteSettings,
}: {
  projects: ProjectSummary[];
  /** The websites whose agent waits for the maker's answer (Q292). */
  waiting?: string[];
  current: ProjectInfo | null;
  onCollapse: () => void;
  onNew: () => void;
  onSettings: () => void;
  /** Opens a website's own settings (Q118). */
  onSiteSettings: (id: string) => void;
}) {
  return (
    <aside data-testid="sidebar" className="flex w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="drag-region flex h-13 items-center justify-end px-2">
        <Button
          variant="ghost"
          size="icon-sm"
          className="no-drag"
          onClick={onCollapse}
          tip={t.sidebar.collapse}
          command="sidebar"
        >
          <PanelLeft />
        </Button>
      </div>
      <div className="px-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={onNew}
          tip={t.sidebar.newProjectTip}
          tipSide="right"
          command="new-website"
        >
          <Plus />
          {t.sidebar.newProject}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground"
          onClick={() => void upstart.invoke("projects:choose-folder")}
          tip={t.sidebar.openFolderTip}
          tipSide="right"
          command="open-folder"
        >
          <FolderOpen />
          {t.sidebar.openFolder}
        </Button>
      </div>
      <div className="mt-4 px-4 pb-1 text-xs font-medium text-muted-foreground">{t.sidebar.projects}</div>
      <nav className="flex-1 overflow-y-auto px-2 pb-2" aria-label={t.sidebar.projects}>
        {projects.length === 0 ? (
          <p className="px-2 py-1 text-sm text-muted-foreground">{t.sidebar.noProjects}</p>
        ) : (
          projects.map((project) => (
            <div
              key={project.id}
              className={cn(
                "group flex items-center rounded-md transition-colors hover:bg-sidebar-accent",
                current?.id === project.id && "bg-sidebar-accent font-medium",
              )}
            >
              {/* Its tip also says what the waiting dot means. */}
              <Tip
                side="right"
                text={
                  waiting.includes(project.id)
                    ? t.sidebar.openWaiting(project.path)
                    : t.sidebar.openProject(project.path)
                }
              >
                <button
                  type="button"
                  data-testid="project-item"
                  onClick={() => void upstart.invoke("projects:open", project.id)}
                  className="min-w-0 flex-1 px-2 py-1.5 text-left text-sm"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="truncate">{project.name}</span>
                    {waiting.includes(project.id) && (
                      <span data-testid="project-waiting" className="size-2 shrink-0 rounded-full bg-primary">
                        <span className="sr-only">{t.sidebar.waiting}</span>
                      </span>
                    )}
                  </span>
                </button>
              </Tip>
              <Tip text={t.site.open(project.name)} side="right">
                <button
                  type="button"
                  data-testid="project-settings"
                  aria-label={t.site.open(project.name)}
                  onClick={() => onSiteSettings(project.id)}
                  className={cn(
                    "mr-1 rounded p-1 text-muted-foreground opacity-0 hover:bg-background hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100",
                    current?.id === project.id && "opacity-100",
                  )}
                >
                  <SlidersHorizontal className="size-3.5" />
                </button>
              </Tip>
            </div>
          ))
        )}
      </nav>
      <div className="border-t p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground"
          onClick={onSettings}
          tip={t.sidebar.settingsTip}
          tipSide="right"
          command="settings"
          data-testid="open-settings"
        >
          <Settings />
          {t.sidebar.settings}
        </Button>
      </div>
    </aside>
  );
}
