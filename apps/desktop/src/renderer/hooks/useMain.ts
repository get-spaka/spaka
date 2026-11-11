import { useEffect, useState } from "react";
import { applyEvent } from "../../shared/conversation";
import {
  type AgentStatus,
  type AppInfo,
  type AppSettings,
  type ConnectorInfo,
  type ConversationState,
  DEFAULT_APP_SETTINGS,
  type HistoryEntry,
  type PageComment,
  type PreviewState,
  type ProjectInfo,
  type ProjectSummary,
  type SkillInfo,
} from "../../shared/ipc";
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

/** The open project's versions, kept in step with the main process. */
export function useHistory(projectId: string | undefined) {
  const [state, setState] = useState<{ projectId: string; entries: HistoryEntry[] } | null>(null);
  useEffect(() => {
    let live = true;
    const off = upstart.on("history:changed", (message) => setState(message));
    if (projectId) void upstart.invoke("history:list").then((entries) => live && setState({ projectId, entries }));
    return () => {
      live = false;
      off();
    };
  }, [projectId]);
  return state && state.projectId === projectId ? state.entries : [];
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

const EMPTY_PREVIEW: PreviewState = {
  route: null,
  title: "",
  routes: [],
  loading: false,
  mode: "edit",
  theme: "",
  view: "page",
  writing: null,
  zoomTrial: "crossfade",
};

export function usePreviewState() {
  const [state, setState] = useState<PreviewState>(EMPTY_PREVIEW);
  useEffect(() => upstart.on("preview:state", setState), []);
  return state;
}

/** The maker's comments on the page, waiting to be sent (Q95). */
export function useComments(projectId: string | undefined) {
  const [comments, setComments] = useState<PageComment[]>([]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: another project has its own comments
  useEffect(() => {
    let live = true;
    void upstart.invoke("comments:list").then((list) => live && setComments(list));
    const off = upstart.on("comments:changed", setComments);
    return () => {
      live = false;
      off();
    };
  }, [projectId]);
  return comments;
}

/** The skills the open project's agent gets, kept in step with the main process. */
export function useSkills(projectId: string | undefined) {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: another project has other skills
  useEffect(() => {
    let live = true;
    void upstart.invoke("skills:list").then((list) => live && setSkills(list));
    const off = upstart.on("skills:changed", setSkills);
    return () => {
      live = false;
      off();
    };
  }, [projectId]);
  return skills;
}

/** The connectors, with their state, kept in step with the main process. */
export function useConnectors(projectId: string | undefined) {
  const [connectors, setConnectors] = useState<ConnectorInfo[]>([]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: another project has other connectors
  useEffect(() => {
    let live = true;
    void upstart.invoke("connectors:list").then((list) => live && setConnectors(list));
    const off = upstart.on("connectors:changed", setConnectors);
    return () => {
      live = false;
      off();
    };
  }, [projectId]);
  return connectors;
}

/** The app's own settings (Q117), kept in step across the app's windows. */
export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  useEffect(() => {
    let live = true;
    void upstart.invoke("settings:get").then((s) => live && setSettings(s));
    const off = upstart.on("settings:changed", setSettings);
    return () => {
      live = false;
      off();
    };
  }, []);
  return settings;
}

/** What the main process's app:info says, once. */
export function useAppInfo() {
  const [info, setInfo] = useState<AppInfo>();
  useEffect(() => {
    void upstart.invoke("app:info").then(setInfo);
  }, []);
  return info;
}
