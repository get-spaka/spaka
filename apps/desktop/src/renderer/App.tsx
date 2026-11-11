import { useState } from "react";
import { isWorking } from "../shared/conversation";
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

export function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { projects, current } = useProjects();
  const preview = usePreviewState();
  const items = useConversation(current?.id);
  const history = useHistory(current?.id);
  const status = useAgentStatus();
  const skills = useSkills(current?.id);
  const connectors = useConnectors(current?.id);
  // A website's own settings (Q118), over the window; the app's settings have a window of their own (Q116).
  const [siteOpen, setSiteOpen] = useState(false);
  const siteShown = siteOpen && !!current;

  return (
    <div className="relative flex h-full">
      {sidebarOpen && (
        <Sidebar
          projects={projects}
          current={current}
          onCollapse={() => setSidebarOpen(false)}
          onNew={() => void upstart.invoke("projects:close")}
          onSettings={() => void upstart.invoke("settings:open")}
          onSiteSettings={async (id) => {
            if (current?.id !== id) await upstart.invoke("projects:open", id);
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
        covered={siteShown}
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
    </div>
  );
}
