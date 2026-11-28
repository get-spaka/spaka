// The start screen (Q245, Q249): with no website open, the window has the
// sidebar and this one large panel. The templates to start from, filtered by
// category chips, their thumbnails moving on hover; a click chooses one, View
// shows it large, real and moving, its pages to go to; Import a template adds
// a folder or a .zip. The message box stays at the bottom center and says
// which template the website starts from. Starting from scratch folds the
// templates away: the message box rises to the middle, taller. Starting from a
// template stays so when its template is cleared, and nothing is sent until one
// is chosen. The first message creates the website, and the window takes its
// usual layout.
import { ArrowLeft, Check, CircleDashed, Eye, LayoutTemplate, PenLine, Upload, X } from "lucide-react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  type AgentStatus,
  accountReady,
  TEMPLATE_CATEGORIES,
  type TemplateCategory,
  type TemplateImport,
  type TemplateSummary,
  type TemplateViewState,
} from "../../shared/ipc";
import { spaka } from "../lib/bridge";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";
import { MessageBox, modelName, useNewSettings } from "./Conversation";
import { SignInPanel } from "./SignInPanel";
import { ExpandSidebarButton } from "./UpdateNote";
import { Button } from "./ui/button";
import { NativeSelect } from "./ui/native-select";
import { Tip } from "./ui/tip";

const NO_VIEW: TemplateViewState = { id: null, route: null, title: "", pages: [], loading: false };

export function StartPanel({
  status,
  sidebarOpen,
  onExpandSidebar,
  othersWaiting,
  covered,
}: {
  status: AgentStatus;
  sidebarOpen: boolean;
  onExpandSidebar: () => void;
  /** Another website waits for the maker's answer: a dot on the button that shows the sidebar. */
  othersWaiting?: boolean;
  /** Something is over the window (the settings): the template shown large is hidden. */
  covered: boolean;
}) {
  const [templates, setTemplates] = useState<TemplateSummary[]>();
  const [category, setCategory] = useState<TemplateCategory>();
  const [chosen, setChosen] = useState<string>();
  // The way the maker starts, chosen from the two above the templates. None at first.
  const [mode, setMode] = useState<"scratch" | "template">("scratch");
  const choose = (id: string) => {
    setChosen(id);
    setMode("template");
  };
  const [viewing, setViewing] = useState<string>();
  const [importing, setImporting] = useState<TemplateImport>();
  const viewState = useTemplateView();
  const load = () => spaka.invoke("templates:list").then(setTemplates);
  // biome-ignore lint/correctness/useExhaustiveDependencies: loaded once, then again when the latest catalogue changes it
  useEffect(() => {
    void load();
    return spaka.on("templates:changed", () => void load());
  }, []);

  const [draft, setDraft] = useState("");
  const [newSettings, setSettings] = useNewSettings(status);
  const [sending, setSending] = useState(false);
  // Why the website could not start from the chosen template (Q247): it could not be downloaded.
  const [sendProblem, setSendProblem] = useState<string>();
  const input = useRef<HTMLTextAreaElement>(null);
  // The zone the maker is in, its border thicker: the templates, or the message box. None at first.
  const [zone, setZone] = useState<"templates" | "prompt">();
  const toPrompt = () => {
    setZone("prompt");
    input.current?.focus();
  };
  const send = () => {
    const text = draft.trim();
    if (!text || sending || templateMissing) return;
    setSending(true);
    setSendProblem(undefined);
    void spaka
      .invoke("conversation:send", text, {
        ...newSettings,
        ...(chosen ? { template: chosen } : {}),
      })
      .then((problem) => {
        if (!problem) return;
        setSending(false);
        setSendProblem(problem);
      })
      .catch(() => setSending(false));
  };

  // The template shown large, downloaded first if it has to be; why it cannot be shown.
  const [viewProblem, setViewProblem] = useState<string>();
  const view = (id: string | undefined) => {
    setViewing(id);
    setViewProblem(undefined);
    void spaka.invoke("templates:view", id ?? null).then((problem) => problem && setViewProblem(problem));
  };
  // Leaving the start screen hides the template shown large.
  useEffect(() => () => void spaka.invoke("templates:view", null), []);

  const runImport = async () => {
    const answer = await spaka.invoke("templates:import");
    if (answer) setImporting(answer);
  };
  const accept = async (token: string) => {
    const added = await spaka.invoke("templates:accept-import", token);
    // An earlier import of the same template had other pictures.
    pictures.delete(`${added.id}/cover`);
    pictures.delete(`${added.id}/hover`);
    setImporting(undefined);
    await load();
    choose(added.id);
  };

  // The chips: All, then each category a template has (Q263).
  const categories = TEMPLATE_CATEGORIES.filter((c) => templates?.some((tpl) => tpl.category === c));
  const shown = (templates ?? []).filter((tpl) => !category || tpl.category === category);
  const chosenTemplate = templates?.find((tpl) => tpl.id === chosen);
  const viewed = templates?.find((tpl) => tpl.id === viewing);
  const scratch = mode === "scratch";
  // Starting from a template, none chosen yet (or it was cleared): nothing is sent.
  const templateMissing = mode === "template" && !chosenTemplate;

  return (
    <section data-testid="start" className="relative flex min-w-0 flex-1 flex-col bg-background">
      <div
        className={cn(
          "drag-region flex h-13 shrink-0 items-center gap-2 win:pr-36",
          sidebarOpen ? "px-4" : "pr-4 pl-20 win:pl-4",
        )}
      >
        {!sidebarOpen && <ExpandSidebarButton onClick={onExpandSidebar} waiting={othersWaiting} />}
        <div className="ml-auto" />
        <Button
          variant="ghost"
          size="sm"
          className="no-drag text-muted-foreground"
          data-testid="template-import"
          tip={t.start.importTip}
          onClick={() => void runImport()}
        >
          <Upload />
          {t.start.importTemplate}
        </Button>
      </div>

      {!viewed && (
        <div data-testid="start-top" className="shrink-0 border-b">
          <div className="mx-auto max-w-6xl space-y-4 px-8 pt-1 pb-5">
            <div className="space-y-1">
              <h1 className="text-xl font-semibold tracking-tight">{t.start.title}</h1>
              <p className="text-sm text-muted-foreground">{t.start.text}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr]" data-testid="start-ways">
              <StartWay
                testId="start-way-scratch"
                icon={<PenLine />}
                title={t.start.scratchTitle}
                text={t.start.scratchText}
                tip={t.start.scratchTip}
                active={scratch}
                onClick={() => {
                  setChosen(undefined);
                  setMode("scratch");
                  toPrompt();
                }}
              />
              <span aria-hidden className="self-center justify-self-center text-xs text-muted-foreground">
                {t.start.or}
              </span>
              <StartWay
                testId="start-way-template"
                icon={<LayoutTemplate />}
                title={t.start.templateTitle}
                text={t.start.templateText}
                tip={t.start.templateTip}
                active={mode === "template"}
                detail={chosenTemplate?.name}
                onClick={() => {
                  setMode("template");
                  setZone("templates");
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* From scratch, the templates fold away and the message box rises into their place. */}
      <div
        data-testid="start-templates"
        data-active={zone === "templates" || undefined}
        data-folded={scratch || undefined}
        aria-hidden={scratch || undefined}
        inert={scratch}
        className={cn(
          "relative flex min-h-0 shrink basis-0 flex-col overflow-hidden border-b transition-[flex-grow,opacity,border-color] duration-300 ease-out motion-reduce:transition-none",
          scratch ? "pointer-events-none grow-0 border-transparent opacity-0" : "grow",
        )}
        onPointerDown={() => setZone("templates")}
      >
        {viewed ? (
          <TemplateLarge
            template={viewed}
            state={viewState.id === viewed.id ? viewState : NO_VIEW}
            chosen={chosen === viewed.id}
            active={zone === "templates"}
            hidden={covered || !!importing}
            problem={viewProblem}
            onRetry={() => view(viewed.id)}
            onBack={() => view(undefined)}
            onChoose={() => {
              choose(viewed.id);
              toPrompt();
            }}
          />
        ) : (
          <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-8 py-3">
            <div
              data-testid="start-grid"
              className={cn("min-h-0 flex-1 overflow-y-auto rounded-xl", zone === "templates" && "ring-2 ring-primary")}
            >
              <div className="space-y-5 px-4 pt-4 pb-10">
                <h2 className="text-sm font-medium">{t.start.templatesHeading}</h2>
                {categories.length > 1 && (
                  <div className="flex flex-wrap gap-1.5" role="toolbar" aria-label={t.start.title}>
                    {[undefined, ...categories].map((c) => (
                      <Tip key={c ?? "all"} text={c ? t.start.categoryTip : t.start.allTip}>
                        <button
                          type="button"
                          aria-pressed={category === c}
                          data-testid="template-chip"
                          data-category={c ?? "all"}
                          onClick={() => setCategory(c)}
                          className={cn(
                            "rounded-full border px-2.5 py-0.5 text-xs",
                            category === c
                              ? "border-primary bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                          )}
                        >
                          {c ? t.start.categories[c] : t.start.all}
                        </button>
                      </Tip>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-x-5 gap-y-6">
                  {shown.map((tpl) => (
                    <TemplateCard
                      key={tpl.id}
                      template={tpl}
                      chosen={chosen === tpl.id}
                      onChoose={() => {
                        if (chosen === tpl.id) {
                          setChosen(undefined);
                          setZone("templates");
                        } else {
                          choose(tpl.id);
                          toPrompt();
                        }
                      }}
                      onView={() => view(tpl.id)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* biome-ignore lint/a11y/noStaticElementInteractions: it only shows which zone the maker is in; the focus in its field does the same from the keyboard */}
      <div
        data-testid="start-prompt"
        data-active={zone === "prompt" || undefined}
        className={cn(
          "flex shrink-0 grow-0 flex-col justify-center pt-2 transition-[flex-grow] duration-300 ease-out motion-reduce:transition-none",
          scratch && "grow",
        )}
        onPointerDown={() => setZone("prompt")}
        onFocus={() => setZone("prompt")}
      >
        {!accountReady(status, newSettings.model) && (
          <SignInPanel status={status} modelName={modelName(status, newSettings.model)} />
        )}
        {sendProblem && (
          <div
            data-testid="start-problem"
            role="alert"
            className="mx-auto mb-2 w-[calc(100%-4rem)] max-w-272 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm"
          >
            <p>{sendProblem}</p>
            <p className="text-xs text-muted-foreground">{t.start.orScratch}</p>
          </div>
        )}
        <MessageBox
          className={cn(
            "mx-auto w-full px-8 pb-5 transition-[max-width] duration-300 ease-out motion-reduce:transition-none",
            scratch ? "max-w-3xl" : "max-w-6xl",
          )}
          fieldClassName={cn(
            "transition-[height] duration-300 ease-out motion-reduce:transition-none",
            scratch ? "h-44" : "h-17",
          )}
          sendBlocked={templateMissing ? t.start.noTemplateTip : undefined}
          project={null}
          status={status}
          draft={draft}
          onDraft={setDraft}
          onSend={send}
          input={input}
          working={sending}
          placeholder={chosenTemplate ? t.start.placeholder(chosenTemplate.name) : t.conversation.placeholder}
          newSettings={newSettings}
          onNewSettings={setSettings}
          noPlan={!!chosenTemplate}
          active={zone === "prompt"}
        >
          <div className="flex items-center gap-1.5 px-1 pb-1">
            {chosenTemplate ? (
              <>
                <span
                  data-testid="chosen-template"
                  className="inline-flex items-center gap-1 rounded-full bg-secondary py-0.5 pr-1 pl-2.5 text-xs"
                >
                  {t.start.startingFrom(chosenTemplate.name)}
                  <Tip text={t.start.clear}>
                    <button
                      type="button"
                      className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                      aria-label={t.start.clear}
                      data-testid="chosen-template-clear"
                      onClick={() => {
                        // Still starting from a template: the maker goes back to choose another.
                        setChosen(undefined);
                        setZone("templates");
                      }}
                    >
                      <X className="size-3" />
                    </button>
                  </Tip>
                </span>
                <span className="truncate text-xs text-muted-foreground">{t.start.startingFromHint}</span>
              </>
            ) : templateMissing ? (
              <>
                <span
                  data-testid="chosen-template-missing"
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-warning px-2.5 py-0.5 text-xs text-warning"
                >
                  <CircleDashed className="size-3" />
                  {t.start.noTemplate}
                </span>
                <span className="truncate text-xs text-muted-foreground">{t.start.noTemplateHint}</span>
              </>
            ) : (
              <>
                <span
                  data-testid="chosen-template-none"
                  className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs"
                >
                  <PenLine className="size-3" />
                  {t.start.fromScratch}
                </span>
                <span className="truncate text-xs text-muted-foreground">{t.start.fromScratchHint}</span>
              </>
            )}
          </div>
        </MessageBox>
      </div>

      {importing && (
        <ImportDialog
          answer={importing}
          onAccept={(token) => void accept(token)}
          onClose={() => setImporting(undefined)}
        />
      )}
    </section>
  );
}

/** One of the two ways to start: from a description alone, or from a template. */
function StartWay({
  testId,
  icon,
  title,
  text,
  tip,
  active,
  detail,
  onClick,
}: {
  testId: string;
  icon: ReactNode;
  title: string;
  text: string;
  tip: string;
  active: boolean;
  /** The template chosen, under the way that starts from one. */
  detail?: string;
  onClick: () => void;
}) {
  return (
    <Tip text={tip}>
      <button
        type="button"
        data-testid={testId}
        data-active={active || undefined}
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          "flex items-start gap-3 rounded-lg border p-3 text-left outline-none transition-colors",
          "focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0",
          active ? "border-primary bg-primary/5" : "hover:border-foreground/30 hover:bg-accent/40",
        )}
      >
        <span
          className={cn(
            "mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md",
            active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
          )}
        >
          {icon}
        </span>
        <span className="min-w-0 space-y-0.5">
          <span className="flex items-baseline gap-2">
            <span className="text-sm font-medium">{title}</span>
            {detail && <span className="truncate text-xs text-primary">{detail}</span>}
          </span>
          <span className="block text-xs text-muted-foreground">{text}</span>
        </span>
      </button>
    </Tip>
  );
}

/** A template's thumbnail: its cover, its moving sequence while the pointer rests on it. */
function TemplateCard({
  template,
  chosen,
  onChoose,
  onView,
}: {
  template: TemplateSummary;
  chosen: boolean;
  onChoose: () => void;
  onView: () => void;
}) {
  const cover = usePicture(template.id, "cover", true);
  const [hovered, setHovered] = useState(false);
  // The moving sequence is asked for at the first hover, and starts again at each.
  const [hoverWanted, setHoverWanted] = useState(false);
  const [hovers, setHovers] = useState(0);
  const hover = usePicture(template.id, "hover", hoverWanted);
  return (
    <div
      data-testid="template-card"
      data-template={template.id}
      data-chosen={chosen || undefined}
      className="group space-y-2"
      onPointerEnter={() => {
        setHovered(true);
        setHoverWanted(true);
        setHovers((n) => n + 1);
      }}
      onPointerLeave={() => setHovered(false)}
    >
      <div className="relative">
        {/* no tip: a large picture of the template, its name and description under it */}
        <button
          type="button"
          aria-pressed={chosen}
          // Choosing goes to the message box: the templates' zone is not lit on the way (no flicker).
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onChoose}
          className={cn(
            "relative block aspect-8/5 w-full overflow-hidden rounded-lg border bg-muted outline-none transition-shadow",
            "focus-visible:ring-[3px] focus-visible:ring-ring/50",
            chosen ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "hover:shadow-md",
          )}
        >
          {cover && (
            <img src={cover} alt="" draggable={false} className="absolute inset-0 size-full object-cover object-top" />
          )}
          {hovered && hover && (
            <img
              key={hovers}
              src={hover}
              alt=""
              draggable={false}
              data-testid="template-hover"
              className="absolute inset-0 size-full object-cover object-top"
            />
          )}
        </button>
        <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start gap-1">
          {template.imported && (
            <span className="rounded-full bg-background/90 px-2 py-0.5 text-[11px] text-muted-foreground shadow-xs backdrop-blur">
              {t.start.imported}
            </span>
          )}
          {chosen && (
            <span className="ml-auto inline-flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs">
              <Check className="size-3.5" />
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="secondary"
          data-testid="template-view"
          tip={t.start.viewTip}
          onClick={onView}
          className={cn(
            "absolute right-2 bottom-2 h-7 bg-background/90 shadow-xs backdrop-blur",
            "opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100",
          )}
        >
          <Eye />
          {t.start.view}
        </Button>
      </div>
      <div className="space-y-0.5 px-0.5">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-medium">{template.name}</h2>
          <span className="text-xs text-muted-foreground">{t.start.categories[template.category]}</span>
        </div>
        <p className="line-clamp-2 text-xs text-muted-foreground">{template.description}</p>
      </div>
    </div>
  );
}

/** A template shown large (Q249): real and moving, in a native view over the frame below its bar. */
function TemplateLarge({
  template,
  state,
  chosen,
  active,
  hidden,
  problem,
  onRetry,
  onBack,
  onChoose,
}: {
  template: TemplateSummary;
  state: TemplateViewState;
  chosen: boolean;
  /** The templates are the zone the maker is in: the preview's border is thicker. */
  active: boolean;
  hidden: boolean;
  /** Why it cannot be shown: it could not be downloaded. */
  problem: string | undefined;
  onRetry: () => void;
  onBack: () => void;
  onChoose: () => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = frame.current;
    if (!element || hidden) {
      spaka.send("templates:bounds", null);
      return;
    }
    const send = () => {
      const r = element.getBoundingClientRect();
      spaka.send("templates:bounds", {
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.round(r.width),
        height: Math.round(r.height),
      });
    };
    send();
    const observer = new ResizeObserver(send);
    observer.observe(element);
    window.addEventListener("resize", send);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", send);
      spaka.send("templates:bounds", null);
    };
  }, [hidden]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onBack();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  return (
    <div data-testid="template-large" data-template={template.id} className="flex min-h-0 flex-1 flex-col p-3">
      <div className="flex shrink-0 items-center gap-2 pb-2">
        {/* no tip: its label says where it goes */}
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="template-back">
          <ArrowLeft />
          {t.start.back}
        </Button>
        <span className="truncate text-sm font-medium">{template.name}</span>
        {state.pages.length > 1 && (
          <NativeSelect
            aria-label={t.start.page}
            data-testid="template-page"
            size="xs"
            className="hover:bg-accent"
            value={state.pages.some((p) => p.route === state.route) ? (state.route ?? "/") : ""}
            onChange={(event) => void spaka.invoke("templates:view", template.id, event.target.value)}
          >
            {!state.pages.some((p) => p.route === state.route) && <option value="">{state.title}</option>}
            {state.pages.map((p) => (
              <option key={p.route} value={p.route}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        )}
        <div className="ml-auto" />
        {/* no tip: its label says what it does, then that the template is chosen */}
        <Button
          size="sm"
          variant={chosen ? "secondary" : "default"}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onChoose}
          disabled={chosen}
          data-testid="template-choose"
        >
          {chosen && <Check />}
          {chosen ? t.start.chosen : t.start.choose}
        </Button>
      </div>
      <div
        ref={frame}
        data-testid="template-frame"
        data-native-view
        data-route={state.route ?? undefined}
        className={cn(
          "flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border bg-muted",
          active && "ring-2 ring-primary",
        )}
      >
        {/* Under the template's own view: seen while it downloads, or when it cannot be shown. */}
        {problem ? (
          <div data-testid="template-problem" role="alert" className="max-w-sm space-y-3 text-center text-sm">
            <p>{problem}</p>
            <Button size="sm" variant="outline" tip={t.start.tryAgainTip} onClick={onRetry}>
              {t.start.tryAgain}
            </Button>
          </div>
        ) : (
          state.id !== template.id && (
            <p className="text-sm text-muted-foreground">{t.start.downloading(template.name)}</p>
          )
        )}
      </div>
    </div>
  );
}

/** An imported template, shown before it is added (Q248): its name and pictures; or why it cannot be one. */
function ImportDialog({
  answer,
  onAccept,
  onClose,
}: {
  answer: TemplateImport;
  onAccept: (token: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      data-testid="template-import-dialog"
      className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 p-8 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg space-y-4 rounded-xl border bg-background p-5 shadow-lg">
        <h2 className="font-semibold">{t.start.importTitle}</h2>
        {"problems" in answer ? (
          <div className="space-y-2 text-sm">
            <p>{t.start.importProblems}</p>
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {answer.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="space-y-3">
            {answer.cover && <img src={answer.cover} alt="" className="w-full rounded-lg border" />}
            <div className="space-y-0.5">
              <p className="text-sm font-medium">{answer.template.name}</p>
              <p className="text-xs text-muted-foreground">{answer.template.description}</p>
            </div>
            {answer.pages.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {answer.pages.map((url) => (
                  <img
                    key={url.slice(-40)}
                    src={url}
                    alt=""
                    className="aspect-3/4 w-full rounded border object-cover object-top"
                  />
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" tip={t.start.importCancelTip} onClick={onClose}>
            {t.start.importCancel}
          </Button>
          {"token" in answer && (
            <Button
              size="sm"
              data-testid="template-import-add"
              tip={t.start.importAddTip}
              onClick={() => onAccept(answer.token)}
            >
              {t.start.importAdd}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

const pictures = new Map<string, Promise<string | null>>();

/** A template's picture, asked for once `wanted`, kept for the session. */
function usePicture(id: string, which: "cover" | "hover", wanted: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    const key = `${id}/${which}`;
    if (!pictures.has(key))
      pictures.set(
        key,
        spaka.invoke("templates:picture", id, which).catch(() => null),
      );
    void pictures.get(key)!.then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [id, which, wanted]);
  return url;
}

function useTemplateView() {
  const [state, setState] = useState<TemplateViewState>(NO_VIEW);
  useEffect(() => spaka.on("templates:view-state", setState), []);
  return state;
}
