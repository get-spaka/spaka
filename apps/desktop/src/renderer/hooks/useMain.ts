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
  type ListedProject,
  type PageComment,
  type PreviewState,
  type ProjectInfo,
  type SkillInfo,
  type UpdateState,
} from "../../shared/ipc";
import { spaka } from "../lib/bridge";

/** The known projects and the open one, kept in step with the main process. */
export function useProjects() {
  const [projects, setProjects] = useState<ListedProject[]>([]);
  const [current, setCurrent] = useState<ProjectInfo | null>(null);
  // Until both are known, the window shows the startup view rather than the start screen.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    void Promise.all([
      spaka.invoke("projects:list").then(setProjects),
      spaka.invoke("projects:current").then(setCurrent),
    ]).then(() => setLoaded(true));
    const offList = spaka.on("projects:changed", setProjects);
    const offOpen = spaka.on("project:opened", setCurrent);
    return () => {
      offList();
      offOpen();
    };
  }, []);
  return { projects, current, loaded };
}

/** The open project's conversation, kept in step with the agent's work. */
export function useConversation(projectId: string | undefined) {
  const [state, setState] = useState<ConversationState | null>(null);
  useEffect(() => {
    let live = true;
    setState(null);
    // Events and answers come in order: what the answer holds is not applied twice.
    const off = spaka.on("conversation:event", ({ projectId: id, event }) =>
      setState((s) => (s && s.projectId === id ? { ...s, items: applyEvent(s.items, event) } : s)),
    );
    if (projectId) void spaka.invoke("conversation:get").then((s) => live && setState(s));
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
    const off = spaka.on("history:changed", (message) => setState(message));
    if (projectId) void spaka.invoke("history:list").then((entries) => live && setState({ projectId, entries }));
    return () => {
      live = false;
      off();
    };
  }, [projectId]);
  return state && state.projectId === projectId ? state.entries : [];
}

const NO_STATUS: AgentStatus = {
  auth: "unknown",
  hasApiKey: false,
  accounts: { chatgpt: false, openai: false, gemini: false, vertex: false },
  chatgpt: { signingIn: false },
  models: [],
};

/** The websites whose agent waits for the maker's answer (Q292). */
export function useWaiting() {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    void spaka.invoke("agent:waiting").then(setIds);
    return spaka.on("agent:waiting", setIds);
  }, []);
  return ids;
}

/** The app's own update, one state for the whole interface: read once, then kept by its events. */
let lastUpdate: UpdateState = { state: "idle" };
const updateListeners = new Set<(state: UpdateState) => void>();
let updateWatched = false;
function watchUpdate() {
  if (updateWatched) return;
  updateWatched = true;
  const set = (state: UpdateState) => {
    lastUpdate = state;
    for (const listener of updateListeners) listener(state);
  };
  spaka.on("app:update", set);
  void spaka.invoke("app:update-state").then((state) => {
    // An event that came first is the newer.
    if (lastUpdate.state === "idle") set(state);
  });
}

/** Where the app's own update stands (Q367, Q378). */
export function useUpdate() {
  const [update, setUpdate] = useState<UpdateState>(lastUpdate);
  useEffect(() => {
    watchUpdate();
    setUpdate(lastUpdate);
    updateListeners.add(setUpdate);
    return () => {
      updateListeners.delete(setUpdate);
    };
  }, []);
  return update;
}

export function useAgentStatus() {
  const [status, setStatus] = useState<AgentStatus>(NO_STATUS);
  useEffect(() => {
    void spaka.invoke("agent:status").then(setStatus);
    return spaka.on("agent:status", setStatus);
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
};

export function usePreviewState() {
  const [state, setState] = useState<PreviewState>(EMPTY_PREVIEW);
  useEffect(() => spaka.on("preview:state", setState), []);
  return state;
}

/** The maker's comments on the page, waiting to be sent (Q95). */
export function useComments(projectId: string | undefined) {
  const [comments, setComments] = useState<PageComment[]>([]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: another project has its own comments
  useEffect(() => {
    let live = true;
    void spaka.invoke("comments:list").then((list) => live && setComments(list));
    const off = spaka.on("comments:changed", setComments);
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
    void spaka.invoke("skills:list").then((list) => live && setSkills(list));
    const off = spaka.on("skills:changed", setSkills);
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
    void spaka.invoke("connectors:list").then((list) => live && setConnectors(list));
    const off = spaka.on("connectors:changed", setConnectors);
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
    void spaka.invoke("settings:get").then((s) => live && setSettings(s));
    const off = spaka.on("settings:changed", setSettings);
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
    void spaka.invoke("app:info").then(setInfo);
  }, []);
  return info;
}
