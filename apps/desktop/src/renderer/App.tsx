import { useState } from "react";
import { Conversation } from "./components/Conversation";
import { PreviewPane } from "./components/PreviewPane";
import { Sidebar } from "./components/Sidebar";
import { usePreviewState, useProjects } from "./hooks/useMain";

export function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { projects, current } = useProjects();
  const preview = usePreviewState();

  return (
    <div className="flex h-full">
      {sidebarOpen && (
        <Sidebar projects={projects} current={current} onCollapse={() => setSidebarOpen(false)} onNew={() => {}} />
      )}
      <Conversation project={current} sidebarOpen={sidebarOpen} onExpandSidebar={() => setSidebarOpen(true)} />
      <PreviewPane project={current} state={preview} layoutKey={sidebarOpen} />
    </div>
  );
}
