import { ArrowUp, Check, ChevronRight, CircleSlash, Eraser, Loader2, PanelLeft, Square, X } from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  type Activity,
  type AgentPart,
  type ConversationItem,
  isPlan,
  isWaiting,
  isWorking,
  waitingFor,
} from "../../shared/conversation";
import {
  type AgentMode,
  type AgentStatus,
  accountOf,
  accountReady,
  type Effort,
  type OutputStyle,
  type PreviewState,
  type ProjectInfo,
  usableModel,
} from "../../shared/ipc";
import { useAppSettings } from "../hooks/useMain";
import { upstart } from "../lib/bridge";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";
import { ModelOptions } from "../settings/model";
import { AdaptationBar, useAdaptation } from "./AdaptationBar";
import { AgentText } from "./AgentText";
import { BlocksTab } from "./BlocksTab";
import { ContentTab } from "./ContentTab";
import { PagesCard } from "./PagesCard";
import { PlanCard } from "./PlanCard";
import { QuestionCard } from "./QuestionCard";
import { SignInPanel } from "./SignInPanel";
import { ThemeTab } from "./ThemeTab";
import { Button } from "./ui/button";

export function Conversation({
  project,
  items,
  status,
  sidebarOpen,
  onExpandSidebar,
  preview,
}: {
  project: ProjectInfo | null;
  items: ConversationItem[];
  status: AgentStatus;
  sidebarOpen: boolean;
  onExpandSidebar: () => void;
  preview: PreviewState;
}) {
  const [draft, setDraft] = useState("");
  // The middle column's tabs (Q100): the conversation, the gallery's blocks.
  const [tab, setTab] = useState<"conversation" | "blocks" | "theme" | "content">("conversation");
  const shownTab = project ? tab : "conversation";
  // Before the first message there is no project yet: the choice waits for it.
  const [newSettings, setNewSettings] = useNewSettings(status);
  const working = isWorking(items);
  // The agent waits for the maker's answer: editing comes back, and the message box answers (Q284, Q294).
  const waiting = isWaiting(items);
  const planWaits = isPlan(waitingFor(items));
  // A website being adapted from its template, page by page (Q303).
  const adaptation = useAdaptation(project?.id);
  const editingPaused = working && !waiting;
  const model = project?.model ?? newSettings.model;
  const input = useRef<HTMLTextAreaElement>(null);
  // "Ask the agent about it" (Q136): the page's address starts the message, the field takes the keyboard.
  const [prefilled, setPrefilled] = useState(0);
  useEffect(
    () =>
      upstart.on("conversation:prefill", (text) => {
        setTab("conversation");
        setDraft((d) => (d.trim() ? `${d.trimEnd()}\n${text}` : text));
        setPrefilled((n) => n + 1);
      }),
    [],
  );
  useEffect(() => {
    const el = input.current;
    if (!prefilled || !el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [prefilled]);

  const send = () => {
    const text = draft.trim();
    if (!text || editingPaused) return;
    setDraft("");
    void upstart.invoke("conversation:send", text, project ? undefined : newSettings).catch(() => setDraft(text));
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

      {project && (
        <div role="tablist" className="flex shrink-0 gap-1 border-b px-3">
          {(["conversation", "blocks", "theme", "content"] as const).map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={shownTab === name}
              data-testid={`tab-${name}`}
              onClick={() => setTab(name)}
              className={cn(
                "-mb-px border-b-2 px-2 py-1.5 text-xs font-medium",
                shownTab === name
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.tabs[name]}
            </button>
          ))}
        </div>
      )}

      {shownTab === "blocks" ? (
        <BlocksTab
          projectId={project?.id}
          theme={preview.theme}
          hasPage={preview.route !== null && preview.routes.length > 0}
          working={editingPaused}
        />
      ) : shownTab === "content" ? (
        <ContentTab
          working={editingPaused}
          onAsk={(text) => {
            setTab("conversation");
            setDraft((d) => (d.trim() ? `${d.trimEnd()}\n${text}` : text));
            setPrefilled((n) => n + 1);
          }}
        />
      ) : shownTab === "theme" ? (
        <ThemeTab
          theme={preview.theme}
          working={editingPaused}
          onAskDark={() => {
            setTab("conversation");
            void upstart.invoke("conversation:send", t.theme.askDarkMessage);
          }}
        />
      ) : (
        <>
          {items.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
              <h1 className="text-lg font-semibold tracking-tight">{t.conversation.emptyTitle}</h1>
              <p className="max-w-72 text-sm text-muted-foreground">{t.conversation.emptyText}</p>
            </div>
          ) : (
            <Messages items={items} />
          )}

          {!accountReady(status, model) && <SignInPanel status={status} modelName={modelName(status, model)} />}

          {adaptation && (adaptation.chosen || !working) && <AdaptationBar state={adaptation} working={working} />}

          <MessageBox
            project={project}
            status={status}
            draft={draft}
            onDraft={setDraft}
            onSend={send}
            input={input}
            working={working}
            waiting={waiting}
            placeholder={
              planWaits
                ? t.conversation.changesPlaceholder
                : waiting
                  ? t.conversation.answerPlaceholder
                  : items.length
                    ? t.conversation.placeholderFollowUp
                    : t.conversation.placeholder
            }
            newSettings={newSettings}
            onNewSettings={setNewSettings}
          />
        </>
      )}
    </section>
  );
}

/**
 * The model and effort for a new website: chosen before its first message, or
 * the settings' (Q117), on an account that is connected (Q275).
 */
export function useNewSettings(status: AgentStatus) {
  const defaults = useAppSettings();
  const [chosen, setChosen] = useState<NewSettings>();
  const asked = chosen ?? { model: defaults.newModel, effort: defaults.newEffort, mode: "build" as const };
  return [{ ...asked, model: usableModel(status, asked.model) }, setChosen] as const;
}

/** The model, effort and Build / Plan mode of a website not created yet (Q117, Q286). */
export type NewSettings = { model: string; effort: Effort; mode: AgentMode };

/** A model as the maker knows it, or its account's name when its account is not connected. */
export function modelName(status: AgentStatus, model: string): string {
  return status.models.find((m) => m.id === model)?.name ?? t.accounts.names[accountOf(model)];
}

/**
 * The message field, the model and effort, and the send or stop button: under
 * the conversation, and at the bottom of the start screen (Q245).
 */
export function MessageBox({
  project,
  status,
  draft,
  onDraft,
  onSend,
  input,
  working,
  waiting = false,
  placeholder,
  newSettings,
  onNewSettings,
  className,
  children,
  noPlan = false,
}: {
  project: ProjectInfo | null;
  status: AgentStatus;
  draft: string;
  onDraft: (draft: string) => void;
  onSend: () => void;
  input?: RefObject<HTMLTextAreaElement | null>;
  working: boolean;
  /** The agent waits for the maker's answer: what is typed answers it (Q284). */
  waiting?: boolean;
  placeholder: string;
  newSettings: NewSettings;
  onNewSettings: (settings: NewSettings) => void;
  className?: string;
  /** Shown above the field, inside its frame: the template chosen (Q249). */
  children?: ReactNode;
  /** A website started from a template has no plan mode: the card of pages and the adaptation stand for it (Q312). */
  noPlan?: boolean;
}) {
  const blocked = !accountReady(status, project?.model ?? newSettings.model);
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      onSend();
    }
  };
  return (
    <form
      className={cn("p-3", className)}
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
    >
      <div className="rounded-xl border bg-background p-2 shadow-xs focus-within:ring-[3px] focus-within:ring-ring/30">
        {children}
        <textarea
          data-testid="message-input"
          ref={input}
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={3}
          className="max-h-48 w-full resize-none bg-transparent px-1 py-1 text-sm outline-none placeholder:text-muted-foreground"
        />
        <div className="flex min-w-0 items-center gap-1">
          <ModelControls
            project={project}
            status={status}
            newSettings={newSettings}
            onNewSettings={onNewSettings}
            working={working}
            noPlan={noPlan}
          />
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {working && (
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
            )}
            {(!working || waiting) && (
              <Button
                type="submit"
                size="icon-sm"
                data-testid="send"
                disabled={!draft.trim() || blocked}
                title={t.conversation.send}
              >
                <ArrowUp />
              </Button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}

function Messages({ items }: { items: ConversationItem[] }) {
  const style = useAppSettings().outputStyle;
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
            <AgentParts parts={item.parts} working={item.status === "working"} style={style} />
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

/**
 * The agent's words and steps, as the output style says (Q127). Discreet: a
 * run of steps is one line, "5 steps", that unfolds, and only the step under
 * way shows while the agent works. Normal: one line per step. Detailed: each
 * step with what it ran or searched and why it failed, and the agent's
 * thinking, in grey.
 */
function AgentParts({ parts, working, style }: { parts: AgentPart[]; working: boolean; style: OutputStyle }) {
  const shown = style === "detailed" ? parts : parts.filter((p) => p.kind !== "thinking");
  if (style !== "discreet")
    return shown.map((part, index) =>
      part.kind === "activity" ? (
        <ActivityLine key={part.activity.id} activity={part.activity} detailed={style === "detailed"} />
      ) : (
        // biome-ignore lint/suspicious/noArrayIndexKey: parts only grow at the end
        <PartView key={index} part={part} streaming={working && index === shown.length - 1} />
      ),
    );
  // Runs of steps, between the agent's words.
  const groups: ({ kind: "steps"; activities: Activity[] } | Exclude<AgentPart, { kind: "activity" }>)[] = [];
  for (const part of shown) {
    const last = groups.at(-1);
    if (part.kind !== "activity") groups.push(part);
    else if (last?.kind === "steps") last.activities.push(part.activity);
    else groups.push({ kind: "steps", activities: [part.activity] });
  }
  return groups.map((group, index) => {
    if (group.kind !== "steps")
      // biome-ignore lint/suspicious/noArrayIndexKey: parts only grow at the end
      return <PartView key={index} part={group} streaming={working && index === groups.length - 1} />;
    const steps = group.activities;
    if (working && index === groups.length - 1) return <ActivityLine key={steps.at(-1)!.id} activity={steps.at(-1)!} />;
    if (steps.length === 1) return <ActivityLine key={steps[0]!.id} activity={steps[0]!} />;
    return <Steps key={steps[0]!.id} activities={steps} />;
  });
}

/** The agent's words, its thinking, or a card of its questions or of its plan. */
function PartView({ part, streaming }: { part: Exclude<AgentPart, { kind: "activity" }>; streaming: boolean }) {
  if (part.kind === "question") return <QuestionCard card={part.card} />;
  if (part.kind === "pages") return <PagesCard card={part.card} />;
  if (part.kind === "plan") return <PlanCard card={part.card} />;
  return <PartText part={part} streaming={streaming} />;
}

function PartText({
  part,
  streaming = false,
}: {
  part: { kind: "text" | "thinking"; text: string };
  streaming?: boolean;
}) {
  if (part.kind === "thinking")
    return (
      <p
        data-testid="thinking"
        className="whitespace-pre-wrap border-l-2 border-border pl-2 text-xs leading-relaxed text-muted-foreground italic"
      >
        {part.text.trim()}
      </p>
    );
  return <AgentText text={part.text.trim()} streaming={streaming} />;
}

function Steps({ activities }: { activities: Activity[] }) {
  const [open, setOpen] = useState(false);
  const failed = activities.filter((a) => a.state === "failed" || a.state === "refused").length;
  return (
    <div>
      <button
        type="button"
        data-testid="steps"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        {t.conversation.steps(activities.length, failed)}
      </button>
      {open && (
        <div className="mt-1 space-y-1.5 pl-5.5">
          {activities.map((a) => (
            <ActivityLine key={a.id} activity={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityLine({ activity, detailed }: { activity: Activity; detailed?: boolean }) {
  const Icon = { running: Loader2, done: Check, failed: X, refused: CircleSlash }[activity.state];
  return (
    <div>
      <div
        data-testid="activity"
        data-state={activity.state}
        className="flex items-center gap-2 text-xs text-muted-foreground"
      >
        <Icon className={cn("size-3.5 shrink-0", activity.state === "running" && "animate-spin")} />
        <span className="truncate font-mono">{activity.label}</span>
      </div>
      {detailed && activity.detail && (
        <pre
          data-testid="activity-detail"
          className="mt-0.5 ml-5.5 whitespace-pre-wrap break-all font-mono text-[11px] text-muted-foreground/80"
        >
          {activity.detail}
        </pre>
      )}
      {detailed && activity.error && (
        <p data-testid="activity-error" className="mt-0.5 ml-5.5 whitespace-pre-wrap text-[11px] text-destructive/80">
          {activity.error}
        </p>
      )}
    </div>
  );
}

const CONNECT = "connect-another-account";

/** The model and effort selectors (decisions: kept per project, changed at any moment). */
function ModelControls({
  project,
  status,
  newSettings,
  onNewSettings,
  working = false,
  noPlan = false,
}: {
  project: ProjectInfo | null;
  status: AgentStatus;
  newSettings: NewSettings;
  onNewSettings: (settings: NewSettings) => void;
  /** Whether the agent works: the mode waits for its next message (Q286). */
  working?: boolean;
  noPlan?: boolean;
}) {
  // A choice on its way to the main process, shown until the project says it.
  const [sent, setSent] = useState<{ projectId?: string; model?: string; effort?: Effort; mode?: AgentMode }>({});
  const pending = sent.projectId === project?.id ? sent : {};
  const model = pending.model ?? project?.model ?? newSettings.model;
  const effort = pending.effort ?? project?.effort ?? newSettings.effort;
  const mode = pending.mode ?? (project ? (project.mode ?? "build") : newSettings.mode);
  const models = status.models;
  const choice = models.find((m) => m.id === model);
  const efforts: Effort[] = choice?.efforts.length ? choice.efforts : ["low", "medium", "high"];

  const change = (next: { model?: string; effort?: Effort; mode?: AgentMode }) => {
    if (!project) return onNewSettings({ model, effort, mode, ...next });
    setSent({ projectId: project.id, ...next });
    const done = () => setSent({});
    if (next.model) void upstart.invoke("agent:set-model", next.model).finally(done);
    if (next.effort) void upstart.invoke("agent:set-effort", next.effort).finally(done);
    if (next.mode) void upstart.invoke("agent:set-mode", next.mode).finally(done);
  };

  const select = "h-7 rounded-md bg-transparent px-1.5 text-xs text-muted-foreground outline-none hover:bg-accent";
  return (
    <>
      <select
        aria-label={t.conversation.model}
        data-testid="model-select"
        // As wide as its longest model: it shrinks before the send and stop buttons are pushed out of the box.
        className={cn(select, "min-w-0 shrink truncate")}
        disabled={!models.length}
        value={model}
        onChange={(event) => {
          if (event.target.value === CONNECT) return void upstart.invoke("settings:open", "agent");
          change({ model: event.target.value });
        }}
      >
        {!choice && <option value={model}>{modelName(status, model)}</option>}
        <ModelOptions models={models} />
        <option value={CONNECT}>{t.accounts.connectAnother}</option>
      </select>
      <select
        aria-label={t.conversation.effort}
        data-testid="effort-select"
        className={cn(select, "shrink-0")}
        value={effort}
        onChange={(event) => change({ effort: event.target.value as Effort })}
      >
        {efforts.map((level) => (
          <option key={level} value={level}>
            {t.conversation.efforts[level]}
          </option>
        ))}
      </select>
      {!noPlan && (
        <select
          aria-label={t.conversation.mode}
          title={t.conversation.planHint}
          data-testid="mode-select"
          className={cn(select, "shrink-0", mode === "plan" && "text-foreground")}
          disabled={working}
          value={mode}
          onChange={(event) => change({ mode: event.target.value as AgentMode })}
        >
          {(["build", "plan"] as const).map((m) => (
            <option key={m} value={m}>
              {t.conversation.modes[m]}
            </option>
          ))}
        </select>
      )}
    </>
  );
}
