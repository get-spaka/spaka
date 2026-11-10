import { useState } from "react";
import { isWorking } from "../shared/conversation";
import { Conversation } from "./components/Conversation";
import { PreviewPane } from "./components/PreviewPane";
import { SettingsDialog } from "./components/SettingsDialog";
import { Sidebar } from "./components/Sidebar";
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
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="relative flex h-full">
      {sidebarOpen && (
        <Sidebar
          projects={projects}
          current={current}
          onCollapse={() => setSidebarOpen(false)}
          onNew={() => void upstart.invoke("projects:close")}
          onSettings={() => setSettingsOpen(true)}
        />
      )}
      <Conversation
        project={current}
        items={items}
        history={history}
        status={status}
        sidebarOpen={sidebarOpen}
        onExpandSidebar={() => setSidebarOpen(true)}
      />
      <PreviewPane
        project={current}
        state={preview}
        working={isWorking(items)}
        covered={settingsOpen}
        layoutKey={sidebarOpen}
      />
      {settingsOpen && (
        <SettingsDialog
          project={current}
          skills={skills}
          connectors={connectors}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
