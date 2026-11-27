import { ArrowRight, Check, ChevronDown, ChevronRight, Copy, FolderOpen, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ExportLink, ExportResult, ProjectInfo, PublishChoice, PublishInfo } from "../../shared/ipc";
import { spaka } from "../lib/bridge";
import { messageOf } from "../lib/errors";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";
import { stillToAdapt, useAdaptation } from "./AdaptationBar";
import { Button } from "./ui/button";
import { Tip } from "./ui/tip";

/** The simple way (Q483): the one a maker needs no technical knowledge for. The others are the advanced ones. */
const SIMPLE = "static";
/**
 * The other ways, in the order shown: Cloudflare first, free for a small
 * website and with no server to rent or look after (Q483).
 */
const ADVANCED = ["cloudflare", "node"];
/** The hosting services the simple way names besides the one its steps follow. */
const OTHER_HOSTS = ["cloudflare", "github"] as const;
/** Each way's help on domain names, at its hosting service. */
const DOMAIN_HELP: Record<string, ExportLink> = { static: "netlify-domain", cloudflare: "worker-domain" };

/** A text to copy, with a button that says it was. */
function CopyButton({ text, label, testid }: { text: string; label: string; testid?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 shrink-0"
      tip={t.export.copyTip}
      data-testid={testid}
      onClick={() =>
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
    >
      {copied ? <Check /> : <Copy />}
      {copied ? t.export.copied : label}
    </Button>
  );
}

/**
 * Publishing the website (Q187, Q482 to Q485), always at a hosting service of
 * the maker's: the simple way first, recommended and chosen the first time,
 * which is the static export put online by dragging its folder onto a page;
 * the ways that keep what visitors send folded under the other ways,
 * open when one was used last or when the simple way is refused, which it
 * is, saying why, when a page shows what visitors send. The last way is
 * chosen again (it can be changed). Then the form services' addresses for the
 * simple way; the export into a folder, the management token written into it
 * (Q191); the steps that put it online; and how to use a domain name of one's
 * own. A dialog centred in the preview column, over a dimmed picture of the
 * page, the native view hidden meanwhile; Escape or a click beside it closes
 * it (Q392). During a template's adaptation, the page types still showing its
 * contents are named first (Q311).
 */
export function ExportDialog({
  project,
  working,
  onClose,
}: {
  project: ProjectInfo;
  working: boolean;
  onClose: () => void;
}) {
  const [info, setInfo] = useState<PublishInfo | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [folder, setFolder] = useState<string | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toAdapt = stillToAdapt(useAdaptation(project.id));
  const [anyway, setAnyway] = useState(false);

  useEffect(() => {
    void spaka
      .invoke("export:choices")
      .then((loaded) => {
        setInfo(loaded);
        const usable = (c: PublishChoice) => !c.refused?.length;
        const simple = loaded.choices.find((c) => c.id === SIMPLE);
        // How it was published last time is chosen again, and the simple way the first time; another can be picked.
        const first =
          loaded.choices.find((c) => c.id === loaded.last && usable(c)) ??
          (simple && usable(simple) ? simple : undefined);
        if (first) {
          setChoice(first.id);
          void spaka.invoke("export:last", first.id).then(setFolder);
        }
        // The advanced ways show when one is chosen, or when they are all there is.
        setAdvanced(first ? first.id !== SIMPLE : true);
      })
      .catch((e) => setError(messageOf(e)));
  }, []);

  const chosen = info?.choices.find((c) => c.id === choice);
  const simple = info?.choices.filter((c) => c.id === SIMPLE) ?? [];
  const rank = (c: PublishChoice) => (ADVANCED.includes(c.id) ? ADVANCED.indexOf(c.id) : ADVANCED.length);
  const others = (info?.choices.filter((c) => c.id !== SIMPLE) ?? []).sort((a, b) => rank(a) - rank(b));
  const way = (c: PublishChoice) => {
    const words = t.export.builders[c.id];
    const refused = !!c.refused?.length;
    return (
      <Tip key={c.id} text={refused ? t.export.refusedTip : t.export.pickTip}>
        <button
          type="button"
          aria-pressed={choice === c.id}
          disabled={refused}
          onClick={() => pick(c.id)}
          data-testid="publish-choice"
          data-id={c.id}
          data-refused={refused || undefined}
          className={cn(
            "rounded-lg border p-3 text-left text-sm transition-colors",
            choice === c.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent",
            refused && "cursor-not-allowed hover:bg-transparent",
          )}
        >
          <span className={cn("flex items-center gap-2", refused && "opacity-60")}>
            <span className="font-medium">{words?.name ?? c.id}</span>
            {c.id === SIMPLE && !refused && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {t.export.recommended}
              </span>
            )}
          </span>
          <p className={cn("mt-1 text-muted-foreground", refused && "opacity-60")}>{words?.line}</p>
          {refused && (
            <p className="mt-1 text-warning" data-testid="publish-refused">
              {t.export.refused(c.refused!.join(", "))}
            </p>
          )}
        </button>
      </Tip>
    );
  };
  const pick = (id: string) => {
    setChoice(id);
    setResult(null);
    setError(null);
    setFolder(null);
    void spaka.invoke("export:last", id).then(setFolder);
  };

  const run = async (target: string) => {
    if (!choice) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await spaka.invoke("export:run", target, choice));
      setFolder(target);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };
  const choose = async () => {
    const picked = await spaka.invoke("export:choose-folder");
    if (picked) await run(picked);
  };

  // Escape closes it, as a click beside it does (Q392).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a click outside is for the pointer; Escape and the close button do the same from the keyboard
    <div
      data-testid="export-backdrop"
      className="absolute inset-0 z-10 no-drag flex items-center justify-center bg-scrim p-6 text-left animate-in fade-in-0"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        data-testid="export-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t.export.title}
        className="flex max-h-full w-full max-w-lg flex-col gap-6 overflow-y-auto rounded-xl border bg-background px-6 py-6 shadow-2xl animate-in fade-in-0 zoom-in-95"
      >
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{t.export.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t.export.intro}</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} tip={t.export.closeTip} data-testid="export-close">
            <X />
          </Button>
        </div>

        {toAdapt.length > 0 && !anyway ? (
          <section
            data-testid="publish-adaptation"
            className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning-muted0/5 p-4"
          >
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <TriangleAlert className="size-4 text-warning" />
              {t.adaptation.publish.title}
            </h3>
            <p className="text-sm text-muted-foreground">{t.adaptation.publish.body(toAdapt.map((s) => s.name))}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                data-testid="publish-continue-adaptation"
                disabled={working}
                tip={t.adaptation.publish.continueTip}
                onClick={() => {
                  onClose();
                  void spaka.invoke("adaptation:continue");
                }}
              >
                {t.adaptation.publish.continue}
                <ArrowRight />
              </Button>
              <Button
                variant="outline"
                data-testid="publish-anyway"
                tip={t.adaptation.publish.anywayTip}
                onClick={() => setAnyway(true)}
              >
                {t.adaptation.publish.anyway}
              </Button>
            </div>
          </section>
        ) : (
          <>
            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-medium">{t.export.step1}</h3>
              <div className="flex flex-col gap-2">
                {simple.map(way)}
                {others.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="self-start"
                    aria-expanded={advanced}
                    tip={advanced ? t.export.advancedHideTip : t.export.advancedShowTip}
                    data-testid="publish-advanced"
                    onClick={() => setAdvanced(!advanced)}
                  >
                    {advanced ? <ChevronDown /> : <ChevronRight />}
                    {t.export.advanced}
                  </Button>
                )}
                {advanced && others.map(way)}
              </div>

              {chosen?.needs.formServices && (info?.forms.length ?? 0) > 0 && (
                <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3" data-testid="form-services">
                  <h4 className="text-sm font-medium">{t.export.forms.title}</h4>
                  <p className="text-xs text-muted-foreground">{t.export.forms.intro}</p>
                  {info!.forms.map((name) => (
                    <FormService key={name} name={name} initial={project.formServices?.[name] ?? ""} />
                  ))}
                </div>
              )}
            </section>

            <section className={cn("flex flex-col gap-3", !choice && "opacity-50")}>
              <h3 className="text-sm font-medium">{t.export.step2}</h3>
              {working && <p className="text-sm text-muted-foreground">{t.export.agentWorking}</p>}
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => void choose()}
                  disabled={!choice || busy || working}
                  tip={t.export.chooseTip}
                  data-testid="export-choose"
                >
                  <FolderOpen />
                  {t.export.choose}
                </Button>
                {choice && folder && (
                  <Button
                    variant="outline"
                    onClick={() => void run(folder)}
                    disabled={busy || working}
                    tip={t.export.againTip}
                    data-testid="export-again"
                  >
                    {t.export.again}
                  </Button>
                )}
              </div>
              {busy && <p className="text-sm text-muted-foreground">{t.export.running}</p>}
              {error && (
                <p className="text-sm text-destructive" data-testid="export-error">
                  {error}
                </p>
              )}
              {result && (
                <div data-testid="export-result" className="rounded-lg border bg-muted/40 p-3 text-sm">
                  <p>{t.export.done(result.pages.length)}</p>
                  <Tip text={t.export.reveal}>
                    <button
                      type="button"
                      className="mt-1 max-w-full truncate text-left font-mono text-xs text-muted-foreground underline-offset-2 hover:underline"
                      onClick={() => void spaka.invoke("export:reveal", result.folder)}
                    >
                      {result.folder}
                    </button>
                  </Tip>
                  {result.warnings.length > 0 && (
                    <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground" data-testid="export-warnings">
                      {result.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>

            {result && (
              <section className="flex flex-col gap-3" data-testid="publish-guide" data-builder={result.builder}>
                <h3 className="text-sm font-medium">{t.export.step3}</h3>
                {result.guide.some((s) => s.command) && (
                  <p className="text-xs text-muted-foreground">{t.export.inFolder}</p>
                )}
                <ol className={cn("flex flex-col gap-3", result.builder === SIMPLE && "list-decimal pl-5")}>
                  {result.guide
                    .filter((step) => step.id !== "forms" || (info?.forms.length ?? 0) > 0)
                    .map((step) => (
                      <li key={step.id} data-testid="guide-step" data-id={step.id} className="text-sm">
                        <p>{t.export.guides[result.builder]?.[step.id] ?? step.id}</p>
                        {step.command && (
                          <div className="mt-1 flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1">
                            <code className="min-w-0 flex-1 break-all font-mono text-xs">{step.command}</code>
                            <CopyButton text={step.command} label={t.export.copy} />
                          </div>
                        )}
                        {result.builder === SIMPLE && step.id === "open" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            tip={t.export.hostTip}
                            data-testid="open-host"
                            onClick={() => void spaka.invoke("export:open-host", "netlify")}
                          >
                            {t.export.openNetlify}
                          </Button>
                        )}
                        {result.builder === SIMPLE && step.id === "drop" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            tip={t.export.reveal}
                            data-testid="show-folder"
                            onClick={() => void spaka.invoke("export:reveal", result.folder)}
                          >
                            <FolderOpen />
                            {t.export.showFolder}
                          </Button>
                        )}
                      </li>
                    ))}
                </ol>
                {result.builder === SIMPLE ? (
                  <details data-testid="other-hosts" className="text-sm">
                    <summary className="cursor-pointer font-medium">{t.export.others.title}</summary>
                    <ul className="mt-2 flex flex-col gap-2">
                      {OTHER_HOSTS.map((host) => (
                        <li key={host} className="rounded-lg border p-3">
                          <LinkButton to={host}>{t.export.hosts[host].name}</LinkButton>
                          <p className="mt-1 text-muted-foreground">{t.export.hosts[host].how}</p>
                        </li>
                      ))}
                      <li className="text-muted-foreground">{t.export.others.any}</li>
                    </ul>
                  </details>
                ) : (
                  <p className="text-xs text-muted-foreground">{t.export.guideFile}</p>
                )}
              </section>
            )}

            {result && t.export.domain.steps[result.builder] && (
              <details data-testid="publish-domain" data-builder={result.builder} className="text-sm">
                <summary className="cursor-pointer font-medium">{t.export.domain.title}</summary>
                <p className="mt-2 text-muted-foreground">{t.export.domain.intro}</p>
                <ol className="mt-2 flex list-decimal flex-col gap-2 pl-5">
                  {t.export.domain.steps[result.builder]!.map((step) => (
                    <li key={step} data-testid="domain-step">
                      {step}
                    </li>
                  ))}
                </ol>
                {DOMAIN_HELP[result.builder] && (
                  <p className="mt-2">
                    <LinkButton to={DOMAIN_HELP[result.builder]!}>{t.export.domain.help[result.builder]}</LinkButton>
                  </p>
                )}
                {result.builder === SIMPLE && (
                  <p className="mt-2 flex flex-wrap gap-x-2 text-muted-foreground">
                    {t.export.domain.others}
                    {OTHER_HOSTS.map((host) => (
                      <LinkButton key={host} to={`${host}-domain`}>
                        {t.export.domain.otherHelp[host]}
                      </LinkButton>
                    ))}
                  </p>
                )}
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** A page of a hosting service's, opened in the maker's browser. */
function LinkButton({ to, children }: { to: ExportLink; children: React.ReactNode }) {
  return (
    <Tip text={t.export.hostTip}>
      <button
        type="button"
        className="font-medium underline underline-offset-2"
        onClick={() => void spaka.invoke("export:open-host", to)}
      >
        {children}
      </button>
    </Tip>
  );
}

/** A form's form service address (Q178), kept in the project. */
function FormService({ name, initial }: { name: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-1"
      data-testid="form-service"
      data-name={name}
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        spaka
          .invoke("projects:set-form-service", name, value)
          .then(() => {
            setSaved(true);
            setTimeout(() => setSaved(false), 1500);
          })
          .catch((e) => setError(messageOf(e)));
      }}
    >
      <span className="text-xs font-medium">{t.export.forms.label(name)}</span>
      <div className="flex gap-2">
        <input
          type="url"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="https://"
          aria-label={t.export.forms.label(name)}
          className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
        />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          className="h-8"
          tip={t.export.forms.saveTip}
          data-testid="form-service-save"
        >
          {saved ? t.export.forms.saved : t.export.forms.save}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
