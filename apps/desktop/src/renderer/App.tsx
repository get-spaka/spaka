import { useCallback, useEffect, useState } from "react";
import { isWorking } from "../shared/conversation";
import type { SettingsPage } from "../shared/ipc";
import { Conversation } from "./components/Conversation";
import { MediaPicker } from "./components/MediaPicker";
import { PreviewPane } from "./components/PreviewPane";
import { Sidebar } from "./components/Sidebar";
import { SiteSettings } from "./components/SiteSettings";
import { StartPanel } from "./components/StartPanel";
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
import { upstart } from "./lib/bridge";
import { usePickRequest } from "./lib/picker";
import { SettingsPanel } from "./settings/SettingsPanel";

export function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { projects, current } = useProjects();
  const preview = usePreviewState();
  const items = useConversation(current?.id);
  const history = useHistory(current?.id);
  const status = useAgentStatus();
  const skills = useSkills(current?.id);
  const connectors = useConnectors(current?.id);
  const waiting = useWaiting();
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
      upstart.on("settings:show", ({ page, toggle }) => {
        if (page) setSettingsPage(page);
        setSettingsOpen((open) => (toggle ? !open : true));
        setSiteOpen(false);
      }),
    [],
  );
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  return (
    <div className="relative flex h-full">
      {sidebarOpen && (
        <Sidebar
          projects={projects}
          waiting={waiting}
          current={current}
          onCollapse={() => setSidebarOpen(false)}
          onNew={() => void upstart.invoke("projects:close")}
          onSettings={() => {
            setSiteOpen(false);
            setSettingsOpen(true);
          }}
          onSiteSettings={async (id) => {
            if (current?.id !== id) await upstart.invoke("projects:open", id);
            setSettingsOpen(false);
            setSiteOpen(true);
          }}
        />
      )}
      {current ? (
        <>
          <Conversation
            project={current}
            items={items}
            status={status}
            sidebarOpen={sidebarOpen}
            onExpandSidebar={() => setSidebarOpen(true)}
            preview={preview}
          />
          <PreviewPane
            project={current}
            state={preview}
            working={isWorking(items)}
            covered={siteShown || settingsOpen || !!picking}
            layoutKey={sidebarOpen}
            history={history}
          />
        </>
      ) : (
        // No website open: the start screen, one large panel (Q245).
        <StartPanel
          status={status}
          sidebarOpen={sidebarOpen}
          onExpandSidebar={() => setSidebarOpen(true)}
          covered={settingsOpen}
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
      {settingsOpen && <SettingsPanel page={settingsPage} onPage={setSettingsPage} onClose={closeSettings} />}
    </div>
  );
}
