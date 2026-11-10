import { useEffect, useState } from "react";
import type { PreviewState, ProjectInfo, ProjectSummary } from "../../shared/ipc";
import { upstart } from "../lib/bridge";

/** The known projects and the open one, kept in step with the main process. */
export function useProjects() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [current, setCurrent] = useState<ProjectInfo | null>(null);
  useEffect(() => {
    void upstart.invoke("projects:list").then(setProjects);
    void upstart.invoke("projects:current").then(setCurrent);
    const offList = upstart.on("projects:changed", setProjects);
    const offOpen = upstart.on("project:opened", setCurrent);
    return () => {
      offList();
      offOpen();
    };
  }, []);
  return { projects, current };
}

const EMPTY_PREVIEW: PreviewState = { route: null, title: "", routes: [], loading: false };

export function usePreviewState() {
  const [state, setState] = useState<PreviewState>(EMPTY_PREVIEW);
  useEffect(() => upstart.on("preview:state", setState), []);
  return state;
}
