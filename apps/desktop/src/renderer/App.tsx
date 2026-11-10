import { useState } from "react";
import { Conversation } from "./components/Conversation";
import { PreviewPane } from "./components/PreviewPane";
import { Sidebar } from "./components/Sidebar";
import { useAgentStatus, useConversation, usePreviewState, useProjects } from "./hooks/useMain";
import { upstart } from "./lib/bridge";

export function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { projects, current } = useProjects();
  const preview = usePreviewState();
  const items = useConversation(current?.id);
  const status = useAgentStatus();

  return (
    <div className="flex h-full">
      {sidebarOpen && (
        <Sidebar
          projects={projects}
          current={current}
          onCollapse={() => setSidebarOpen(false)}
          onNew={() => void upstart.invoke("projects:close")}
        />
      )}
      <Conversation
        project={current}
        items={items}
        status={status}
        sidebarOpen={sidebarOpen}
        onExpandSidebar={() => setSidebarOpen(true)}
      />
      <PreviewPane project={current} state={preview} layoutKey={sidebarOpen} />
    </div>
  );
}
