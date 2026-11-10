import { ArrowUp, Check, CircleSlash, Eraser, Loader2, PanelLeft, Square, X } from "lucide-react";
import { type KeyboardEvent, useLayoutEffect, useRef, useState } from "react";
import { type Activity, type ConversationItem, isWorking } from "../../shared/conversation";
import type { AgentStatus, Effort, HistoryEntry, ProjectInfo } from "../../shared/ipc";
import { upstart } from "../lib/bridge";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";
import { HistoryControls } from "./HistoryPanel";
import { SignInPanel } from "./SignInPanel";
import { Button } from "./ui/button";

export function Conversation({
  project,
  items,
  history,
  status,
  sidebarOpen,
  onExpandSidebar,
}: {
  project: ProjectInfo | null;
  items: ConversationItem[];
  history: HistoryEntry[];
  status: AgentStatus;
  sidebarOpen: boolean;
  onExpandSidebar: () => void;
}) {
  const [draft, setDraft] = useState("");
  // Before the first message there is no project yet: the choice waits for it.
  const [newSettings, setNewSettings] = useState<{ model: string; effort: Effort }>({
    model: "claude-sonnet-5-5",
    effort: "medium",
  });
  const working = isWorking(items);
  const signedOut = status.auth === "signed-out" || status.auth === "signing-in";

  const send = () => {
    const text = draft.trim();
    if (!text || working) return;
    setDraft("");
    void upstart.invoke("conversation:send", text, project ? undefined : newSettings).catch(() => setDraft(text));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  };

  return (
    <section data-testid="conversation" className="relative flex w-[420px] shrink-0 flex-col border-r bg-background">
      {/* Room for the window's buttons when the sidebar is hidden. */}
      <div className={cn("drag-region flex h-13 shrink-0 items-center gap-2", sidebarOpen ? "px-4" : "pr-4 pl-20")}>
        {!sidebarOpen && (
          <Button variant="ghost" size="icon-sm" className="no-drag" onClick={onExpandSidebar} title={t.sidebar.expand}>
            <PanelLeft />
          </Button>
        )}
        {project && (
          <span data-testid="project-name" className="truncate text-sm font-medium">
            {project.name}
          </span>
        )}
        <div className="ml-auto" />
        {project && <HistoryControls entries={history} disabled={working} />}
        {project && items.length > 0 && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="no-drag text-muted-foreground"
            disabled={working}
            onClick={() => void upstart.invoke("conversation:start-over")}
            title={t.conversation.startOver}
            data-testid="start-over"
          >
            <Eraser />
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
          <h1 className="text-lg font-semibold tracking-tight">{t.conversation.emptyTitle}</h1>
          <p className="max-w-72 text-sm text-muted-foreground">{t.conversation.emptyText}</p>
        </div>
      ) : (
        <Messages items={items} />
      )}

      {signedOut && <SignInPanel status={status} />}

      <form
        className="p-3"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <div className="rounded-xl border bg-background p-2 shadow-xs focus-within:ring-[3px] focus-within:ring-ring/30">
          <textarea
            data-testid="message-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={items.length ? t.conversation.placeholderFollowUp : t.conversation.placeholder}
            rows={3}
            className="max-h-48 w-full resize-none bg-transparent px-1 py-1 text-sm outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center gap-1">
            <ModelControls project={project} status={status} newSettings={newSettings} onNewSettings={setNewSettings} />
            <div className="ml-auto">
              {working ? (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="secondary"
                  data-testid="stop"
                  onClick={() => void upstart.invoke("conversation:stop")}
                  title={t.conversation.stop}
                >
                  <Square className="size-3 fill-current" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon-sm"
                  data-testid="send"
                  disabled={!draft.trim() || signedOut}
                  title={t.conversation.send}
                >
                  <ArrowUp />
                </Button>
              )}
            </div>
          </div>
        </div>
      </form>
    </section>
  );
}

function Messages({ items }: { items: ConversationItem[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  // Follows the agent as it writes, unless the maker scrolled up to read.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  });
  return (
    <div
      ref={scroller}
      data-testid="messages"
      onScroll={(event) => {
        const el = event.currentTarget;
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
      className="flex-1 select-text space-y-4 overflow-y-auto px-4 py-3"
    >
      {items.map((item) => {
        if (item.kind === "maker")
          return (
            <div key={item.id} data-testid="maker-message" className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-secondary px-3 py-2 text-sm">
                {item.text}
              </div>
            </div>
          );
        if (item.kind === "notice")
          return (
            <p key={item.id} data-testid="notice" className="text-center text-xs text-muted-foreground">
              {item.text}
            </p>
          );
        return (
          <div key={item.id} data-testid="agent-message" data-status={item.status} className="space-y-1.5 text-sm">
            {item.parts.map((part, index) =>
              part.kind === "text" ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: parts only grow at the end
                <p key={index} className="whitespace-pre-wrap leading-relaxed">
                  {part.text.trim()}
                </p>
              ) : (
                <ActivityLine key={part.activity.id} activity={part.activity} />
              ),
            )}
            {item.status === "working" && item.parts.length === 0 && (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                {t.conversation.working}
              </p>
            )}
            {item.status === "stopped" && <p className="text-xs text-muted-foreground">{t.conversation.stopped}</p>}
            {item.status === "failed" && item.error && (
              <p data-testid="agent-error" className="text-xs text-destructive">
                {item.error}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ActivityLine({ activity }: { activity: Activity }) {
  const Icon = { running: Loader2, done: Check, failed: X, refused: CircleSlash }[activity.state];
  return (
    <div
      data-testid="activity"
      data-state={activity.state}
      className="flex items-center gap-2 text-xs text-muted-foreground"
    >
      <Icon className={cn("size-3.5", activity.state === "running" && "animate-spin")} />
      <span className="truncate font-mono">{activity.label}</span>
    </div>
  );
}

/** The model and effort selectors (decisions: kept per project, changed at any moment). */
function ModelControls({
  project,
  status,
  newSettings,
  onNewSettings,
}: {
  project: ProjectInfo | null;
  status: AgentStatus;
  newSettings: { model: string; effort: Effort };
  onNewSettings: (settings: { model: string; effort: Effort }) => void;
}) {
  // A choice on its way to the main process, shown until the project says it.
  const [sent, setSent] = useState<{ projectId?: string; model?: string; effort?: Effort }>({});
  const pending = sent.projectId === project?.id ? sent : {};
  const model = pending.model ?? project?.model ?? newSettings.model;
  const effort = pending.effort ?? project?.effort ?? newSettings.effort;
  const models = status.models;
  const choice = models.find((m) => m.id === model);
  const efforts: Effort[] = choice?.efforts.length ? choice.efforts : ["low", "medium", "high"];

  const change = (next: { model?: string; effort?: Effort }) => {
    if (!project) return onNewSettings({ model, effort, ...next });
    setSent({ projectId: project.id, ...next });
    const done = () => setSent({});
    if (next.model) void upstart.invoke("agent:set-model", next.model).finally(done);
    if (next.effort) void upstart.invoke("agent:set-effort", next.effort).finally(done);
  };

  const select = "h-7 rounded-md bg-transparent px-1.5 text-xs text-muted-foreground outline-none hover:bg-accent";
  return (
    <>
      <select
        aria-label={t.conversation.model}
        data-testid="model-select"
        className={select}
        disabled={!models.length}
        value={model}
        onChange={(event) => change({ model: event.target.value })}
      >
        {!choice && <option value={model}>{model}</option>}
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <select
        aria-label={t.conversation.effort}
        data-testid="effort-select"
        className={select}
        value={effort}
        onChange={(event) => change({ effort: event.target.value as Effort })}
      >
        {efforts.map((level) => (
          <option key={level} value={level}>
            {t.conversation.efforts[level]}
          </option>
        ))}
      </select>
    </>
  );
}
