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
    send: "Send",
    emptyTitle: "What are we building?",
    emptyText: "Describe your website in a few words. Upstart builds it while you watch.",
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
