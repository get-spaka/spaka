// The settings (Q116–Q119), after macOS System Settings, in a panel over
// Upstart's window (Q123): a sidebar with a close button, a search field, the
// Claude account and a coloured icon per category; on the right, the
// category's page in grouped rows. Only what applies to every website is here;
// a website's own settings open from the website (Q118). Escape, ⌘, or a click
// outside closes it.
import { BookOpen, Bot, Info, type LucideIcon, Plug, Search, Shield, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  OUTPUT_STYLES,
  type OutputStyle,
  REPLY_STYLES,
  type ReplyStyle,
  SETTINGS_PAGES,
  type SettingsPage,
  TEXT_SIZES,
  type TextSize,
} from "../../shared/ipc";
import { searchSettings } from "../../shared/settings-search";
import { useAgentStatus, useAppInfo, useAppSettings, useConnectors, useProjects, useSkills } from "../hooks/useMain";
import { upstart } from "../lib/bridge";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";
import { ConnectorList, SkillList } from "./lists";
import { ModelRows } from "./model";
import { Group, Highlighted, inputClass, Push, Row, Segmented, Switch } from "./ui";

const ICONS: Record<SettingsPage, { icon: LucideIcon; color: string }> = {
  general: { icon: SlidersHorizontal, color: "bg-[#8e8e93]" },
  agent: { icon: Bot, color: "bg-[#d97757]" },
  skills: { icon: BookOpen, color: "bg-[#8b5cf6]" },
  connectors: { icon: Plug, color: "bg-[#2f7cf6]" },
  privacy: { icon: Shield, color: "bg-[#1f9d55]" },
  about: { icon: Info, color: "bg-[#737373]" },
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
      className="no-drag absolute inset-0 z-30 flex items-center justify-center bg-black/25 p-6"
      data-testid="settings-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.settings.title}
        data-testid="settings"
        className="flex h-full max-h-[780px] w-full max-w-[1100px] overflow-hidden rounded-xl border border-black/10 text-[13px] text-neutral-950 shadow-[0_24px_60px_rgba(0,0,0,0.3)]"
      >
        <nav
          aria-label={t.settings.title}
          className="flex w-[232px] shrink-0 flex-col gap-3 border-r border-neutral-200 bg-[#f2f2f3] px-2.5 pb-3"
        >
          <div className="flex h-11 shrink-0 items-center px-1.5">
            <button
              type="button"
              onClick={onClose}
              aria-label={t.settings.close}
              title={t.settings.close}
              data-testid="settings-close"
              className="group flex size-3.5 items-center justify-center rounded-full bg-[#ff5f57] ring-1 ring-black/10 ring-inset"
            >
              <X className="size-2.5 text-black/60 opacity-0 group-hover:opacity-100" strokeWidth={3} />
            </button>
          </div>
          <label className="flex h-7 items-center gap-1.5 rounded-[7px] bg-neutral-200/80 px-2 text-neutral-600">
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
              className="w-full min-w-0 bg-transparent text-neutral-950 outline-none [&::-webkit-search-cancel-button]:hidden"
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
            className="flex items-center gap-2.5 rounded-lg p-2 text-left hover:bg-neutral-200/60"
            data-testid="settings-account"
          >
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#d97757] text-sm font-semibold text-white"
            >
              C
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="font-semibold">{t.settings.account.name}</span>
              <span className="truncate text-[11px] text-neutral-600">{accountLine(status)}</span>
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
                    p === shown ? "bg-neutral-900 text-white" : "hover:bg-neutral-200/60",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn("flex size-[22px] shrink-0 items-center justify-center rounded-md text-white", color)}
                  >
                    <Icon className="size-3.5" strokeWidth={2.2} />
                  </span>
                  {t.settings.pages[p]}
                </button>
              );
            })}
            {found && pages.length === 0 && (
              <p className="px-2 py-1 text-[11px] text-neutral-600" data-testid="settings-none">
                {t.settings.noMatch(query.trim())}
              </p>
            )}
          </div>
        </nav>

        <main className="flex min-w-0 flex-1 flex-col bg-[#f7f7f8]">
          <header className="flex h-[52px] shrink-0 items-center border-b border-neutral-200 px-6">
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

function accountLine(status: ReturnType<typeof useAgentStatus>): string {
  if (status.auth === "unknown") return t.settings.account.checking;
  if (status.auth === "signing-in") return t.settings.account.signingIn;
  if (status.auth === "signed-out") return t.settings.account.signedOut;
  return t.settings.account.method(status.method);
}

/** A category's picture and a sentence, at the top of its page. */
function Intro({ page, text }: { page: SettingsPage; text: string }) {
  const { icon: Icon, color } = ICONS[page];
  return (
    <section className="flex flex-col items-center gap-1.5 text-center">
      <span
        aria-hidden="true"
        className={cn("flex size-12 items-center justify-center rounded-[13px] text-white", color)}
      >
        <Icon className="size-6" strokeWidth={2} />
      </span>
      <h2 className="text-[15px] font-semibold">{t.settings.pages[page]}</h2>
      <p className="max-w-[440px] leading-snug text-neutral-600">{text}</p>
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
  const [keyOpen, setKeyOpen] = useState(false);
  const [key, setKey] = useState("");
  const signedIn = status.auth === "signed-in";
  const how = t.settings.account.method(status.method);
  return (
    <>
      <Intro page="agent" text={t.settings.agent.intro} />
      <Group title={t.settings.agent.account}>
        <Row
          id="account"
          label={
            signedIn
              ? t.settings.agent.signedInAs(how)
              : status.auth === "signed-out"
                ? t.settings.agent.signedOut
                : accountLine(status)
          }
          detail={
            signedIn
              ? t.settings.agent.passwordNote
              : status.auth === "signed-out"
                ? t.settings.agent.signedOutHelp
                : undefined
          }
        />
        <Row
          id="api-key"
          label={t.settings.agent.apiKey}
          detail={status.hasApiKey ? t.settings.agent.apiKeyKept : t.settings.agent.apiKeyNone}
        >
          {status.hasApiKey ? (
            <Push testid="api-key-remove" onClick={() => void upstart.invoke("agent:set-api-key", null)}>
              {t.settings.agent.removeKey}
            </Push>
          ) : (
            !keyOpen && (
              <Push testid="api-key-use" onClick={() => setKeyOpen(true)}>
                {t.settings.agent.useKey}
              </Push>
            )
          )}
        </Row>
        {keyOpen && !status.hasApiKey && (
          <form
            className="flex items-center gap-2 px-3 py-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!key.trim()) return;
              void upstart.invoke("agent:set-api-key", key).then(() => {
                setKey("");
                setKeyOpen(false);
              });
            }}
          >
            <input
              type="password"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder={t.settings.agent.keyPlaceholder}
              aria-label={t.settings.agent.apiKey}
              className={cn(inputClass, "flex-1")}
              data-testid="api-key-input"
            />
            <Push
              onClick={() => {
                setKey("");
                setKeyOpen(false);
              }}
            >
              {t.settings.agent.cancel}
            </Push>
            <Push type="submit" primary disabled={!key.trim()}>
              {t.settings.agent.saveKey}
            </Push>
          </form>
        )}
      </Group>
      <Group title={t.settings.agent.forNew} caption={t.settings.agent.forNewHelp} testid="settings-new-websites">
        <ModelRows
          idPrefix="new"
          models={status.models}
          model={settings.newModel}
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
        className="flex size-16 items-center justify-center rounded-[18px] bg-neutral-900 text-2xl font-semibold text-white"
      >
        U
      </span>
      <h2 className="text-lg font-semibold">{t.app.name}</h2>
      <p className="text-neutral-600">{t.settings.about.tagline}</p>
      {info && (
        <>
          <p data-testid="about-version">{t.settings.about.version(info.version)}</p>
          <p className="text-neutral-600">{t.settings.about.licence}</p>
          <p className="text-[11px] text-neutral-600">
            {t.settings.about.built(info.versions.electron, info.versions.chromium, info.versions.node)}
          </p>
        </>
      )}
    </section>
  );
}
