import { useEffect, useState } from "react";
import { applyEvent } from "../../shared/conversation";
import type { AgentStatus, ConversationState, PreviewState, ProjectInfo, ProjectSummary } from "../../shared/ipc";
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

/** The open project's conversation, kept in step with the agent's work. */
export function useConversation(projectId: string | undefined) {
  const [state, setState] = useState<ConversationState | null>(null);
  useEffect(() => {
    let live = true;
    setState(null);
    // Events and answers come in order: what the answer holds is not applied twice.
    const off = upstart.on("conversation:event", ({ projectId: id, event }) =>
      setState((s) => (s && s.projectId === id ? { ...s, items: applyEvent(s.items, event) } : s)),
    );
    if (projectId) void upstart.invoke("conversation:get").then((s) => live && setState(s));
    return () => {
      live = false;
      off();
    };
  }, [projectId]);
  return state && state.projectId === projectId ? state.items : [];
}

const NO_STATUS: AgentStatus = { auth: "unknown", hasApiKey: false, models: [] };

export function useAgentStatus() {
  const [status, setStatus] = useState<AgentStatus>(NO_STATUS);
  useEffect(() => {
    void upstart.invoke("agent:status").then(setStatus);
    return upstart.on("agent:status", setStatus);
  }, []);
  return status;
}

const EMPTY_PREVIEW: PreviewState = { route: null, title: "", routes: [], loading: false };

export function usePreviewState() {
  const [state, setState] = useState<PreviewState>(EMPTY_PREVIEW);
  useEffect(() => upstart.on("preview:state", setState), []);
  return state;
}
