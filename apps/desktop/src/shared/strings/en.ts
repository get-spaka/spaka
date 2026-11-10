// Every text the interface shows, in English. The interface reads its texts
// from here only, so that a translation is one more file of the same shape.

export const en = {
  app: {
    name: "Upstart",
  },
  sidebar: {
    projects: "Projects",
    newProject: "New website",
    openFolder: "Open a folder…",
    noProjects: "Your websites will be listed here.",
    collapse: "Hide the sidebar",
    expand: "Show the sidebar",
    settings: "Settings",
  },
  conversation: {
    placeholder: "Describe the website you want…",
    placeholderFollowUp: "Ask for a change…",
    send: "Send",
    stop: "Stop",
    startOver: "Start over",
    startOverDone: "Started over: the agent no longer remembers the conversation above.",
    emptyTitle: "What are we building?",
    emptyText: "Describe your website in a few words. Upstart builds it while you watch.",
    working: "Working…",
    stopped: "Stopped.",
    model: "Model",
    effort: "Effort",
    efforts: { low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max" },
  },
  activity: {
    write: (path?: string) => (path ? `Writing ${path}` : "Writing a file…"),
    edit: (path?: string) => (path ? `Editing ${path}` : "Editing a file…"),
    read: (path?: string) => (path ? `Reading ${path}` : "Reading a file…"),
    search: "Searching the project",
    run: (what?: string) => (what ? `Running ${what}` : "Running a command…"),
    other: (tool: string) => `Using ${tool}`,
  },
  errors: {
    signInNeeded: "Upstart is not signed in to Claude yet. Sign in to continue.",
    agentStopped: "The agent stopped before finishing. You can send your message again.",
    agentLimit: "The agent stopped: it reached the limit of steps for one message.",
    notIsolated: "The agent did not start in Upstart's isolated setup, so it was stopped.",
  },
  signIn: {
    title: "Sign in to Claude",
    text: "Upstart's agent is Claude. Sign in with your Claude subscription, or use an API key from the Claude Console.",
    subscription: "Sign in with Claude",
    console: "Sign in with the Claude Console",
    waiting: "Finish signing in in your browser…",
    openLink: "Open the sign-in page",
    cancel: "Cancel",
    apiKey: "Use an API key",
    apiKeyPlaceholder: "sk-ant-…",
    save: "Save",
    removeKey: "Remove the API key",
    signedInSubscription: "Signed in with your Claude subscription",
    signedInConsole: "Signed in with the Claude Console",
    signedInKey: "Using an API key",
    failed: "Signing in did not finish. Try again.",
  },
  preview: {
    emptyTitle: "Your website appears here",
    emptyText: "As soon as the agent starts writing, you see the page take shape.",
    noProjectTitle: "Start a new website",
    noProjectText: "Describe it in the conversation, or open a folder you already have.",
    reload: "Reload the page",
    pages: "Pages",
    loading: "Loading…",
  },
} as const;

export type Strings = typeof en;
