import { ArrowDownUp, FolderOpen, PanelLeft, Plus, Settings, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { type ListedProject, PROJECT_ORDERS, type ProjectInfo, type ProjectOrder } from "../../shared/ipc";
import { ordered } from "../../shared/project-order";
import { useAppSettings } from "../hooks/useMain";
import { spaka } from "../lib/bridge";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";
import { RenameField } from "./RenameField";
import { UpdateNote } from "./UpdateNote";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
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
  projects: ListedProject[];
  /** The websites whose agent waits for the maker's answer (Q292). */
  waiting?: string[];
  current: ProjectInfo | null;
  onCollapse: () => void;
  onNew: () => void;
  onSettings: () => void;
  /** Opens a website's own settings (Q118). */
  onSiteSettings: (id: string) => void;
}) {
  const { projectOrder } = useAppSettings();
  // The website whose name is being changed in place (Q397).
  const [renaming, setRenaming] = useState<string | null>(null);
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
          onClick={() => void spaka.invoke("projects:choose-folder")}
          tip={t.sidebar.openFolderTip}
          tipSide="right"
          command="open-folder"
        >
          <FolderOpen />
          {t.sidebar.openFolder}
        </Button>
      </div>
      <div className="mt-4 flex items-center justify-between pr-2 pl-4 text-xs font-medium text-muted-foreground">
        {t.sidebar.projects}
        {/* The order of the projects (Q394, Q395), kept from one start to the next. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              data-testid="project-order"
              className="size-6 text-muted-foreground"
              tip={t.sidebar.order(t.sidebar.orders[projectOrder])}
              tipSide="right"
            >
              <ArrowDownUp className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="right">
            <DropdownMenuLabel>{t.sidebar.orderBy}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={projectOrder}
              onValueChange={(order) => void spaka.invoke("settings:set", { projectOrder: order as ProjectOrder })}
            >
              {PROJECT_ORDERS.map((order) => (
                <DropdownMenuRadioItem key={order} value={order} data-testid="project-order-choice" data-order={order}>
                  {t.sidebar.orders[order]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-2" aria-label={t.sidebar.projects}>
        {projects.length === 0 ? (
          <p className="px-2 py-1 text-sm text-muted-foreground">{t.sidebar.noProjects}</p>
        ) : (
          ordered(projects, projectOrder).map((project) => (
            <div
              key={project.id}
              className={cn(
                "group flex items-center rounded-md transition-colors hover:bg-sidebar-accent",
                current?.id === project.id && "bg-sidebar-accent font-medium",
              )}
            >
              {renaming === project.id ? (
                <RenameField
                  name={project.name}
                  className="my-px ml-px px-[7px] py-[5px] text-sm font-normal"
                  onDone={(name) => {
                    setRenaming(null);
                    const clean = name?.trim();
                    if (clean && clean !== project.name) void spaka.invoke("projects:rename", project.id, clean);
                  }}
                />
              ) : (
                // Its tip also says what the waiting dot means, and how to rename it.
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
                    // The open website is not opened again: a double-click renames it.
                    onClick={() => current?.id !== project.id && void spaka.invoke("projects:open", project.id)}
                    onDoubleClick={() => setRenaming(project.id)}
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
              )}
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
        <UpdateNote />
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
