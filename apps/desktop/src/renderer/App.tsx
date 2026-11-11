import { useCallback, useEffect, useState } from "react";
import { isWorking } from "../shared/conversation";
import type { SettingsPage } from "../shared/ipc";
import { Conversation } from "./components/Conversation";
import { PreviewPane } from "./components/PreviewPane";
import { Sidebar } from "./components/Sidebar";
import { SiteSettings } from "./components/SiteSettings";
import {
  useAgentStatus,
  useConnectors,
  useConversation,
  useHistory,
  usePreviewState,
  useProjects,
  useSkills,
} from "./hooks/useMain";
import { upstart } from "./lib/bridge";
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
  // A website's own settings (Q118), over the window.
  const [siteOpen, setSiteOpen] = useState(false);
  const siteShown = siteOpen && !!current;
  // The settings for every website, in a panel over the window (Q123); they open again at the last page.
  const [settingsOpen, setSettingsOpen] = useState(false);
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
        covered={siteShown || settingsOpen}
        layoutKey={sidebarOpen}
        history={history}
      />
      {siteShown && current && (
        <SiteSettings
          project={current}
          status={status}
          skills={skills}
          connectors={connectors}
          onClose={() => setSiteOpen(false)}
        />
      )}
      {settingsOpen && <SettingsPanel page={settingsPage} onPage={setSettingsPage} onClose={closeSettings} />}
    </div>
  );
}
