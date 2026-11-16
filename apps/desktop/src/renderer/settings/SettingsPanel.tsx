// The settings (Q116–Q119), after macOS System Settings, in a panel over
// Upstart's window (Q123): a sidebar with a close button, a search field, the
// connected accounts (Q275) and a colored icon per category; on the right, the
// category's page in grouped rows. Only what applies to every website is here;
// a website's own settings open from the website (Q118). Escape, ⌘, or a click
// outside closes it.
import {
  BookOpen,
  Info,
  Loader2,
  type LucideIcon,
  Plug,
  Search,
  Shield,
  SlidersHorizontal,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type AgentStatus,
  APPEARANCES,
  type Appearance,
  type KeyAccount,
  OUTPUT_STYLES,
  type OutputStyle,
  REPLY_STYLES,
  type ReplyStyle,
  SETTINGS_PAGES,
  type SettingsPage,
  TEXT_SIZES,
  type TextSize,
  usableModel,
} from "../../shared/ipc";
import { searchSettings } from "../../shared/settings-search";
import { useAgentStatus, useAppInfo, useAppSettings, useConnectors, useProjects, useSkills } from "../hooks/useMain";
import { upstart } from "../lib/bridge";
import { ACCOUNT, CLOSE_BUTTON, CLOSE_CROSS, TILES } from "../lib/colors";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";
import { ConnectorList, SkillList } from "./lists";
import { ModelRows } from "./model";
import { Group, Highlighted, inputClass, Push, Row, Segmented, Switch } from "./ui";

const ICONS: Record<SettingsPage, { icon: LucideIcon; color: string }> = {
  general: { icon: SlidersHorizontal, color: TILES.general },
  agent: { icon: UserRound, color: TILES.agent },
  skills: { icon: BookOpen, color: TILES.skills },
  connectors: { icon: Plug, color: TILES.connectors },
  privacy: { icon: Shield, color: TILES.privacy },
  about: { icon: Info, color: TILES.about },
};

export function SettingsPanel({
  page,
  onPage,
  onClose,
}: {
  page: SettingsPage;
  onPage: (page: SettingsPage) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  // The search field has the keyboard, as in System Settings, and not the message field under the panel.
  const searchField = useRef<HTMLInputElement>(null);
  useEffect(() => searchField.current?.focus(), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const found = useMemo(() => searchSettings(query), [query]);
  const pages = found ? SETTINGS_PAGES.filter((p) => found.some((e) => e.page === p)) : [...SETTINGS_PAGES];
  const shown = found && !pages.includes(page) ? pages[0] : page;
  const highlighted = useMemo(() => new Set(found?.map((e) => e.id) ?? []), [found]);
  const status = useAgentStatus();
  const setPage = (next: SettingsPage) => onPage(next);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a click outside is for the pointer; Escape and the close button do the same from the keyboard
    <div
      className="no-drag absolute inset-0 z-30 flex items-center justify-center bg-scrim p-6"
      data-testid="settings-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.settings.title}
        data-testid="settings"
        className="flex h-full max-h-[780px] w-full max-w-[1100px] overflow-hidden rounded-xl border border-border text-[13px] text-foreground shadow-[0_24px_60px_rgba(0,0,0,0.3)]"
      >
        <nav
          aria-label={t.settings.title}
          className="flex w-[232px] shrink-0 flex-col gap-3 border-r border-border bg-panel-nav px-2.5 pb-3"
        >
          <div className="flex h-11 shrink-0 items-center px-1.5">
            <button
              type="button"
              onClick={onClose}
              aria-label={t.settings.close}
              title={t.settings.close}
              data-testid="settings-close"
              className={cn(
                "group flex size-3.5 items-center justify-center rounded-full ring-1 ring-inset",
                CLOSE_BUTTON,
              )}
            >
              <X className={cn("size-2.5 opacity-0 group-hover:opacity-100", CLOSE_CROSS)} strokeWidth={3} />
            </button>
          </div>
          <label className="flex h-7 items-center gap-1.5 rounded-[7px] bg-foreground/[0.08] px-2 text-muted-foreground">
            <Search className="size-3.5 shrink-0" aria-hidden="true" />
            <input
              type="search"
              value={query}
              placeholder={t.settings.search}
              aria-label={t.settings.searchLabel}
              data-testid="settings-search"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                // Escape empties the search first, then closes the settings.
                if (event.key === "Escape" && query) {
                  event.stopPropagation();
                  setQuery("");
                }
              }}
              className="w-full min-w-0 bg-transparent text-foreground outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button type="button" aria-label={t.gallery.clearSearch} onClick={() => setQuery("")}>
                <X className="size-3.5" />
              </button>
            )}
          </label>
          <button
            type="button"
            onClick={() => setPage("agent")}
            className="flex items-center gap-2.5 rounded-lg p-2 text-left hover:bg-foreground/[0.06]"
            data-testid="settings-account"
          >
            <span
              aria-hidden="true"
              className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", ACCOUNT)}
            >
              <UserRound className="size-4" strokeWidth={2.25} />
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="font-semibold">{t.settings.account.title}</span>
              <span className="truncate text-[11px] text-muted-foreground">{accountLine(status)}</span>
            </span>
          </button>
          <div className="flex flex-col gap-0.5">
            {pages.map((p) => {
              const { icon: Icon, color } = ICONS[p];
              return (
                <button
                  type="button"
                  key={p}
                  data-testid={`settings-page-${p}`}
                  aria-current={p === shown ? "page" : undefined}
                  onClick={() => {
                    setPage(p);
                  }}
                  className={cn(
                    "flex items-center gap-2.5 rounded-[7px] px-2 py-[5px] text-left",
                    p === shown ? "bg-primary text-primary-foreground" : "hover:bg-foreground/[0.06]",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn("flex size-[22px] shrink-0 items-center justify-center rounded-md", color)}
                  >
                    <Icon className="size-3.5" strokeWidth={2.2} />
                  </span>
                  {t.settings.pages[p]}
                </button>
              );
            })}
            {found && pages.length === 0 && (
              <p className="px-2 py-1 text-[11px] text-muted-foreground" data-testid="settings-none">
                {t.settings.noMatch(query.trim())}
              </p>
            )}
          </div>
        </nav>

        <main className="flex min-w-0 flex-1 flex-col bg-panel">
          <header className="flex h-[52px] shrink-0 items-center border-b border-border px-6">
            <h1 className="text-[15px] font-semibold" data-testid="settings-title">
              {shown ? t.settings.pages[shown] : t.settings.title}
            </h1>
          </header>
          <div className="flex-1 overflow-y-auto">
            <Highlighted.Provider value={highlighted}>
              <div className="mx-auto flex max-w-[720px] flex-col gap-5 px-7 py-5" data-testid={`settings-${shown}`}>
                {shown === "general" && <GeneralPage />}
                {shown === "agent" && <AgentPage />}
                {shown === "skills" && <SkillsPage />}
                {shown === "connectors" && <ConnectorsPage />}
                {shown === "privacy" && <PrivacyPage />}
                {shown === "about" && <AboutPage />}
              </div>
            </Highlighted.Provider>
          </div>
        </main>
      </div>
    </div>
  );
}

/** The connected accounts, under the sidebar's account button. */
function accountLine(status: AgentStatus): string {
  if (status.auth === "unknown") return t.settings.account.checking;
  const names = [
    ...(status.auth === "signed-in" ? [t.accounts.names.claude] : []),
    ...(["chatgpt", "openai", "gemini", "vertex"] as const)
      .filter((a) => status.accounts[a])
      .map((a) => t.accounts.names[a]),
  ];
  return names.length ? t.settings.account.connected(names) : t.settings.account.none;
}

/** A category's picture and a sentence, at the top of its page. */
function Intro({ page, text }: { page: SettingsPage; text: string }) {
  const { icon: Icon, color } = ICONS[page];
  return (
    <section className="flex flex-col items-center gap-1.5 text-center">
      <span aria-hidden="true" className={cn("flex size-12 items-center justify-center rounded-[13px]", color)}>
        <Icon className="size-6" strokeWidth={2} />
      </span>
      <h2 className="text-[15px] font-semibold">{t.settings.pages[page]}</h2>
      <p className="max-w-[440px] leading-snug text-muted-foreground">{text}</p>
    </section>
  );
}

function GeneralPage() {
  const info = useAppInfo();
  const settings = useAppSettings();
  const g = t.settings.general;
  return (
    <>
      <Group title={g.websites} caption={g.folderHelp}>
        <Row
          id="folder"
          label={g.folder}
          detail={
            <span className="block truncate font-mono" title={info?.projectsDir} data-testid="projects-dir">
              {info?.projectsDir}
            </span>
          }
        >
          <Push testid="reveal-projects" onClick={() => void upstart.invoke("settings:reveal-projects")}>
            {g.reveal}
          </Push>
        </Row>
      </Group>
      <Group title={g.interface}>
        <Row id="appearance" label={g.appearance} detail={g.appearanceHelp}>
          <Segmented<Appearance>
            testid="appearance"
            label={g.appearance}
            value={settings.appearance}
            options={APPEARANCES.map((value) => ({ value, label: g.appearances[value] }))}
            onChange={(appearance) => void upstart.invoke("settings:set", { appearance })}
          />
        </Row>
        <Row id="text-size" label={g.textSize} detail={g.textSizeHelp}>
          <Segmented<TextSize>
            testid="text-size"
            label={g.textSize}
            value={settings.textSize}
            options={TEXT_SIZES.map((value) => ({ value, label: g.textSizes[value] }))}
            onChange={(textSize) => void upstart.invoke("settings:set", { textSize })}
          />
        </Row>
        <Row id="output-style" label={g.outputStyle} detail={g.outputStyleHelp[settings.outputStyle]}>
          <Segmented<OutputStyle>
            testid="output-style"
            label={g.outputStyle}
            value={settings.outputStyle}
            options={OUTPUT_STYLES.map((value) => ({ value, label: g.outputStyles[value] }))}
            onChange={(outputStyle) => void upstart.invoke("settings:set", { outputStyle })}
          />
        </Row>
        <Row id="notify" label={g.notify} detail={g.notifyHelp}>
          <Switch
            testid="notify-switch"
            label={g.notify}
            checked={settings.notifyDone}
            onChange={(notifyDone) => void upstart.invoke("settings:set", { notifyDone })}
          />
        </Row>
      </Group>
    </>
  );
}

function AgentPage() {
  const status = useAgentStatus();
  const settings = useAppSettings();
  const a = t.settings.agent;
  const signedIn = status.auth === "signed-in";
  const how = t.settings.account.method(status.method);
  return (
    <>
      <Intro page="agent" text={a.intro} />
      <Group title={a.claude}>
        <Row
          id="account"
          label={signedIn ? a.signedInAs(how) : status.auth === "signed-out" ? a.signedOut : accountLine(status)}
          detail={
            signedIn
              ? a.passwordNote
              : status.auth === "signed-out"
                ? a.signedOutHelp
                : status.auth === "signing-in"
                  ? a.waiting
                  : undefined
          }
        >
          {status.auth === "signed-out" && (
            <Push testid="claude-sign-in" onClick={() => void upstart.invoke("agent:sign-in", "claudeai")}>
              {a.signIn}
            </Push>
          )}
          {status.auth === "signing-in" && (
            <Push onClick={() => void upstart.invoke("agent:cancel-sign-in")}>{a.cancel}</Push>
          )}
        </Row>
        <KeyRow
          id="api-key"
          label={a.apiKey}
          kept={status.hasApiKey}
          keptText={a.apiKeyKept}
          noneText={a.apiKeyNone}
          onSave={(key) => upstart.invoke("agent:set-api-key", key)}
        />
      </Group>
      <Group title={a.chatgpt}>
        <Row
          id="chatgpt"
          label={a.chatgpt}
          detail={
            status.accounts.chatgpt
              ? a.chatgptOn
              : status.chatgpt.signingIn
                ? a.waiting
                : status.chatgpt.failed
                  ? a.chatgptFailed
                  : a.chatgptOff
          }
        >
          {status.accounts.chatgpt ? (
            <Push testid="chatgpt-sign-out" onClick={() => void upstart.invoke("agent:chatgpt-sign-out")}>
              {a.signOut}
            </Push>
          ) : status.chatgpt.signingIn ? (
            <span className="flex items-center gap-2">
              <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              <Push onClick={() => void upstart.invoke("agent:chatgpt-cancel")}>{a.cancel}</Push>
            </span>
          ) : (
            <Push testid="chatgpt-sign-in" onClick={() => void upstart.invoke("agent:chatgpt-sign-in")}>
              {a.signIn}
            </Push>
          )}
        </Row>
      </Group>
      <Group title={a.keys}>
        {(["openai", "gemini"] as const).map((account) => (
          <KeyRow
            key={account}
            id={`${account}-key`}
            label={a[`${account}Key`]}
            kept={status.accounts[account]}
            keptText={a[`${account}Kept`]}
            noneText={a[`${account}None`]}
            onSave={(key) => upstart.invoke("agent:set-key", account as KeyAccount, key)}
          />
        ))}
      </Group>
      <Group title={a.vertex} caption={a.vertexHelp} testid="settings-vertex">
        <KeyRow
          id="vertex-key"
          label={a.vertexKey}
          kept={status.accounts.vertex && !status.vertexGcloud}
          keptText={a.vertexKept}
          noneText={a.vertexNone}
          onSave={(key) => upstart.invoke("agent:set-key", "vertex", key)}
        />
        <GcloudRow gcloud={status.vertexGcloud} />
      </Group>
      <Group title={t.settings.agent.forNew} caption={t.settings.agent.forNewHelp} testid="settings-new-websites">
        <ModelRows
          idPrefix="new"
          models={status.models}
          // What a new website gets: the settings' model, or a connected account's (Q275).
          model={usableModel(status, settings.newModel)}
          effort={settings.newEffort}
          onChange={(next) =>
            void upstart.invoke("settings:set", {
              ...(next.model ? { newModel: next.model } : {}),
              ...(next.effort ? { newEffort: next.effort } : {}),
            })
          }
        />
      </Group>
      <Group title={t.settings.agent.replies} caption={t.settings.agent.replyStyleNote}>
        <Row
          id="reply-style"
          label={t.settings.agent.replyStyle}
          detail={t.settings.agent.replyStyleHelp[settings.replyStyle]}
        >
          <Segmented<ReplyStyle>
            testid="reply-style"
            label={t.settings.agent.replyStyle}
            value={settings.replyStyle}
            options={REPLY_STYLES.map((value) => ({ value, label: t.settings.agent.replyStyles[value] }))}
            onChange={(replyStyle) => void upstart.invoke("settings:set", { replyStyle })}
          />
        </Row>
      </Group>
    </>
  );
}

/** An API key kept for an account: its state, and a field to paste one or a button to remove it. */
function KeyRow({
  id,
  label,
  kept,
  keptText,
  noneText,
  onSave,
}: {
  id: string;
  label: string;
  kept: boolean;
  keptText: string;
  noneText: string;
  onSave: (key: string | null) => Promise<unknown>;
}) {
  const a = t.settings.agent;
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const close = () => {
    setKey("");
    setOpen(false);
  };
  return (
    <>
      <Row id={id} label={label} detail={kept ? keptText : noneText}>
        {kept ? (
          <Push testid={`${id}-remove`} onClick={() => void onSave(null)}>
            {a.removeKey}
          </Push>
        ) : (
          !open && (
            <Push testid={`${id}-use`} onClick={() => setOpen(true)}>
              {a.useKey}
            </Push>
          )
        )}
      </Row>
      {open && !kept && (
        <form
          className="flex items-center gap-2 px-3 py-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (key.trim()) void onSave(key).then(close);
          }}
        >
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder={a.keyPlaceholder}
            aria-label={label}
            className={cn(inputClass, "flex-1")}
            data-testid={`${id}-input`}
          />
          <Push onClick={close}>{a.cancel}</Push>
          <Push type="submit" primary disabled={!key.trim()}>
            {a.saveKey}
          </Push>
        </form>
      )}
    </>
  );
}

/** Vertex AI on the Google Cloud sign-in made with gcloud: the project it uses, or a field to give one (Q280). */
function GcloudRow({ gcloud }: { gcloud: AgentStatus["vertexGcloud"] }) {
  const a = t.settings.agent;
  const [open, setOpen] = useState(false);
  const [project, setProject] = useState("");
  const close = () => {
    setProject("");
    setOpen(false);
  };
  return (
    <>
      <Row
        id="vertex-gcloud"
        label={a.vertexGcloud}
        detail={
          gcloud
            ? gcloud.signedIn
              ? a.vertexGcloudOn(gcloud.project)
              : a.vertexGcloudWaiting(gcloud.project)
            : a.vertexGcloudOff
        }
      >
        {gcloud ? (
          <Push testid="vertex-gcloud-stop" onClick={() => void upstart.invoke("agent:set-vertex-gcloud", null)}>
            {a.stopProject}
          </Push>
        ) : (
          !open && (
            <Push testid="vertex-gcloud-use" onClick={() => setOpen(true)}>
              {a.useProject}
            </Push>
          )
        )}
      </Row>
      {open && !gcloud && (
        <form
          className="flex items-center gap-2 px-3 py-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (project.trim()) void upstart.invoke("agent:set-vertex-gcloud", project.trim()).then(close);
          }}
        >
          <input
            autoComplete="off"
            spellCheck={false}
            value={project}
            onChange={(event) => setProject(event.target.value)}
            placeholder={a.projectPlaceholder}
            aria-label={a.vertexGcloud}
            className={cn(inputClass, "flex-1")}
            data-testid="vertex-gcloud-input"
          />
          <Push onClick={close}>{a.cancel}</Push>
          <Push type="submit" primary disabled={!project.trim()}>
            {a.saveKey}
          </Push>
        </form>
      )}
    </>
  );
}

function SkillsPage() {
  const { current } = useProjects();
  const skills = useSkills(current?.id);
  return (
    <>
      <Intro page="skills" text={t.skills.intro} />
      <SkillList
        origin="app"
        title={t.settings.skills.app}
        skills={skills.filter((s) => s.origin === "app")}
        caption={t.settings.skills.siteHelp}
      />
    </>
  );
}

function ConnectorsPage() {
  const { current } = useProjects();
  const connectors = useConnectors(current?.id);
  return (
    <>
      <Intro page="connectors" text={t.connectors.intro} />
      <ConnectorList
        scope="app"
        title={t.settings.connectors.app}
        connectors={connectors.filter((c) => c.scope === "app")}
        caption={t.settings.connectors.siteHelp}
      />
    </>
  );
}

function PrivacyPage() {
  const settings = useAppSettings();
  return (
    <Group
      caption={
        <>
          <p>{t.settings.privacy.statisticsHelp}</p>
          <p className="mt-1">{t.settings.privacy.notYet}</p>
        </>
      }
    >
      <Row id="statistics" label={t.settings.privacy.statistics}>
        <Switch
          testid="statistics-switch"
          label={t.settings.privacy.statistics}
          checked={settings.statistics}
          onChange={(statistics) => void upstart.invoke("settings:set", { statistics })}
        />
      </Row>
    </Group>
  );
}

function AboutPage() {
  const info = useAppInfo();
  return (
    <section className="flex flex-col items-center gap-2 py-6 text-center" data-setting="version">
      <span
        aria-hidden="true"
        className="flex size-16 items-center justify-center rounded-[18px] bg-primary text-2xl font-semibold text-primary-foreground"
      >
        U
      </span>
      <h2 className="text-lg font-semibold">{t.app.name}</h2>
      <p className="text-muted-foreground">{t.settings.about.tagline}</p>
      {info && (
        <>
          <p data-testid="about-version">{t.settings.about.version(info.version)}</p>
          <p className="text-muted-foreground">{t.settings.about.licence}</p>
          <p className="text-[11px] text-muted-foreground">
            {t.settings.about.built(info.versions.electron, info.versions.chromium, info.versions.node)}
          </p>
        </>
      )}
    </section>
  );
}
