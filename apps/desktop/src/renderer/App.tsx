import { useCallback, useEffect, useState } from "react";
import { isWaiting, isWorking } from "../shared/conversation";
import type { SettingsPage } from "../shared/ipc";
import { Conversation } from "./components/Conversation";
import { GitForWindows, useGitBash } from "./components/GitForWindows";
import { MediaPicker } from "./components/MediaPicker";
import { PreviewPane } from "./components/PreviewPane";
import { ShortcutsDialog } from "./components/ShortcutsDialog";
import { Sidebar } from "./components/Sidebar";
import { SiteSettings } from "./components/SiteSettings";
import { StartPanel } from "./components/StartPanel";
import { Startup } from "./components/Startup";
import { Tour } from "./components/Tour";
import { TipProvider } from "./components/ui/tip";
import { useCommands } from "./hooks/useCommand";
import {
  useAgentStatus,
  useConnectors,
  useConversation,
  useHistory,
  usePreviewState,
  useProjects,
  useSkills,
  useWaiting,
} from "./hooks/useMain";
import { spaka } from "./lib/bridge";
import { usePickRequest } from "./lib/picker";
import { t } from "./lib/strings";
import { SettingsPanel } from "./settings/SettingsPanel";

export function App() {
  // The sidebar is a column beside the project when the window has room for both; otherwise it opens over
  // the project's panel, until a website is chosen or a click elsewhere, and the window can be as narrow as
  // the project's panel and the preview.
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [need, setNeed] = useState(0);
  const windowWidth = useWindowWidth();
  const docked = windowWidth >= SIDEBAR_WIDTH + need;
  const sidebarDocked = docked && sidebarOpen;
  const sidebarShown = docked ? sidebarOpen : drawerOpen;
  const expandSidebar = () => (docked ? setSidebarOpen(true) : setDrawerOpen(true));
  const collapseSidebar = () => (docked ? setSidebarOpen(false) : setDrawerOpen(false));
  // The page alone, at the window's whole width: the sidebar and the conversation are hidden.
  const [previewOnly, setPreviewOnly] = useState(false);
  // Windows: Git for Windows first (Q375).
  const [gitBash, setGitBash] = useGitBash();
  const { projects, current, loaded } = useProjects();
  const preview = usePreviewState();
  const items = useConversation(current?.id);
  const history = useHistory(current?.id);
  const status = useAgentStatus();
  const skills = useSkills(current?.id);
  const connectors = useConnectors(current?.id);
  const waiting = useWaiting();
  // Another website waits for the maker's answer (Q292): said on the button too while the sidebar is hidden.
  const othersWaiting = waiting.some((id) => id !== current?.id);
  // A website's own settings (Q118), over the window.
  const [siteOpen, setSiteOpen] = useState(false);
  const siteShown = siteOpen && !!current;
  // The settings for every website, in a panel over the window (Q123); they open again at the last page.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The media picker over the window (Q158).
  const picking = usePickRequest();
  const [settingsPage, setSettingsPage] = useState<SettingsPage>("general");
  useEffect(
    () =>
      spaka.on("settings:show", ({ page, toggle }) => {
        if (page) setSettingsPage(page);
        setSettingsOpen((open) => (toggle ? !open : true));
        setSiteOpen(false);
      }),
    [],
  );
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  // The keyboard shortcuts' sheet, from the Help menu (Q335).
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // The tour (Q328, Q338): opened by main once the first website is built, or from the Help menu.
  const [tourStep, setTourStep] = useState<number | null>(null);
  const startTour = useCallback(() => {
    if (!current) return;
    setSettingsOpen(false);
    setSiteOpen(false);
    setShortcutsOpen(false);
    // The page itself is one of its steps.
    void spaka.invoke("preview:set-view", "page");
    setTourStep(0);
  }, [current]);
  useEffect(() => spaka.on("tour:start", startTour), [startTour]);
  const endTour = useCallback((how: "finished" | "skipped") => {
    setTourStep(null);
    void spaka.invoke("tour:seen", how);
  }, []);
  useCommands({
    tour: startTour,
    sidebar: () => {
      if (previewOnly) {
        setPreviewOnly(false);
        expandSidebar();
      } else if (docked) setSidebarOpen((open) => !open);
      else setDrawerOpen((open) => !open);
    },
    "preview-only": () => current && setPreviewOnly((on) => !on),
    // What needs the conversation brings it back.
    "tab-conversation": () => setPreviewOnly(false),
    "tab-blocks": () => setPreviewOnly(false),
    "tab-theme": () => setPreviewOnly(false),
    "tab-content": () => setPreviewOnly(false),
    "new-website": () => void spaka.invoke("projects:close"),
    "open-folder": () => void spaka.invoke("projects:choose-folder"),
    shortcuts: () => setShortcutsOpen((open) => !open),
  });

  // The sidebar over the project closes when the window has room for it again, and when a website opens.
  useEffect(() => {
    if (docked) setDrawerOpen(false);
  }, [docked]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: another website, or none
  useEffect(() => setDrawerOpen(false), [current?.id]);
  useEffect(() => {
    if (!drawerOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && !(event.target as HTMLElement).closest("input"))
        setDrawerOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [drawerOpen]);
  // "Ask the agent about it" writes in the conversation: it is shown again.
  useEffect(() => spaka.on("conversation:prefill", () => setPreviewOnly(false)), []);
  // Escape leaves the page at full width, unless a dialog is open (it closes first).
  useEffect(() => {
    if (!previewOnly) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector('[role="dialog"]')) return;
      setPreviewOnly(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewOnly]);
  const fullWidth = previewOnly && !!current;

  if (!loaded || !gitBash) return <Startup />;
  if (gitBash.needed)
    return (
      <TipProvider>
        <GitForWindows state={gitBash} onChange={setGitBash} />
      </TipProvider>
    );
  return (
    <TipProvider>
      <div className="relative flex h-full">
        {sidebarShown &&
          !fullWidth &&
          (docked ? (
            <Sidebar
              projects={projects}
              waiting={waiting}
              current={current}
              onCollapse={collapseSidebar}
              onNew={() => {
                setDrawerOpen(false);
                void spaka.invoke("projects:close");
              }}
              onSettings={() => {
                setDrawerOpen(false);
                setSiteOpen(false);
                setSettingsOpen(true);
              }}
              onSiteSettings={async (id) => {
                if (current?.id !== id) await spaka.invoke("projects:open", id);
                setDrawerOpen(false);
                setSettingsOpen(false);
                setSiteOpen(true);
              }}
            />
          ) : (
            <>
              {/* no tip: the whole window beside the sidebar, a click there closes it */}
              <button
                type="button"
                tabIndex={-1}
                aria-label={t.sidebar.collapse}
                data-testid="sidebar-backdrop"
                className="absolute inset-0 z-30 cursor-default"
                onClick={() => setDrawerOpen(false)}
              />
              <div className="absolute inset-y-0 left-0 z-30 flex shadow-xl">
                <Sidebar
                  projects={projects}
                  waiting={waiting}
                  current={current}
                  onCollapse={collapseSidebar}
                  onNew={() => {
                    setDrawerOpen(false);
                    void spaka.invoke("projects:close");
                  }}
                  onSettings={() => {
                    setDrawerOpen(false);
                    setSiteOpen(false);
                    setSettingsOpen(true);
                  }}
                  onSiteSettings={async (id) => {
                    if (current?.id !== id) await spaka.invoke("projects:open", id);
                    setDrawerOpen(false);
                    setSettingsOpen(false);
                    setSiteOpen(true);
                  }}
                />
              </div>
            </>
          ))}
        {current ? (
          <>
            <Conversation
              hidden={fullWidth}
              project={current}
              items={items}
              status={status}
              sidebarOpen={sidebarDocked}
              onExpandSidebar={expandSidebar}
              othersWaiting={othersWaiting}
              onSiteSettings={() => {
                setSettingsOpen(false);
                setSiteOpen(true);
              }}
              preview={preview}
            />
            <PreviewPane
              project={current}
              state={preview}
              working={isWorking(items)}
              covered={siteShown || settingsOpen || shortcutsOpen || !!picking}
              layoutKey={`${sidebarDocked}:${fullWidth}`}
              onNeed={setNeed}
              history={history}
              previewOnly={fullWidth}
              onPreviewOnly={setPreviewOnly}
              waiting={isWaiting(items)}
            />
          </>
        ) : (
          // No website open: the start screen, one large panel (Q245).
          <StartPanel
            status={status}
            sidebarOpen={sidebarDocked}
            onExpandSidebar={expandSidebar}
            othersWaiting={othersWaiting}
            covered={settingsOpen || shortcutsOpen}
          />
        )}
        {siteShown && current && (
          <SiteSettings
            project={current}
            status={status}
            skills={skills}
            connectors={connectors}
            onClose={() => setSiteOpen(false)}
          />
        )}
        {picking && <MediaPicker key={picking.id} request={picking} />}
        {tourStep !== null && current && <Tour step={tourStep} onStep={setTourStep} onEnd={endTour} />}
        {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
        {settingsOpen && <SettingsPanel page={settingsPage} onPage={setSettingsPage} onClose={closeSettings} />}
      </div>
    </TipProvider>
  );
}

/** The sidebar's width, w-60. */
const SIDEBAR_WIDTH = 240;

function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return width;
}
