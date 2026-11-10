import { FolderOpen, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ExportResult, ProjectInfo } from "../../shared/ipc";
import { upstart } from "../lib/bridge";
import { t } from "../lib/strings";
import { messageOf } from "./SettingsDialog";
import { Button } from "./ui/button";

type Host = "netlify" | "cloudflare" | "github";
const HOSTS: Host[] = ["netlify", "cloudflare", "github"];

/**
 * Exporting the website as static files, and how to put them online
 * (decisions: static export). Shown over the preview column, whose native
 * view is hidden meanwhile.
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
  const [folder, setFolder] = useState<string | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [siteUrl, setSiteUrl] = useState(project.siteUrl ?? "");
  const [urlError, setUrlError] = useState<string | null>(null);

  useEffect(() => {
    void upstart.invoke("export:last").then((last) => setFolder((f) => f ?? last));
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async (target: string) => {
    setBusy(true);
    setError(null);
    try {
      setResult(await upstart.invoke("export:run", target));
      setFolder(target);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };
  const choose = async () => {
    const chosen = await upstart.invoke("export:choose-folder");
    if (chosen) await run(chosen);
  };
  const saveUrl = async () => {
    setUrlError(null);
    try {
      await upstart.invoke("projects:set-site-url", siteUrl);
    } catch (e) {
      setUrlError(messageOf(e));
    }
  };

  return (
    <div data-testid="export-dialog" className="absolute inset-0 z-10 overflow-y-auto bg-background text-left">
      <div className="mx-auto flex max-w-xl flex-col gap-6 px-8 py-8">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{t.export.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t.export.intro}</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} title={t.export.close} data-testid="export-close">
            <X />
          </Button>
        </div>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">{t.export.step1}</h3>
          {working && <p className="text-sm text-muted-foreground">{t.export.agentWorking}</p>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void choose()} disabled={busy || working} data-testid="export-choose">
              <FolderOpen />
              {t.export.choose}
            </Button>
            {folder && (
              <Button
                variant="outline"
                onClick={() => void run(folder)}
                disabled={busy || working}
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
              <button
                type="button"
                className="mt-1 max-w-full truncate text-left font-mono text-xs text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => void upstart.invoke("export:reveal", result.folder)}
                title={t.export.reveal}
              >
                {result.folder}
              </button>
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

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">{t.export.step2}</h3>
          <p className="text-sm text-muted-foreground">{t.export.hostsIntro}</p>
          <ul className="flex flex-col gap-2">
            {HOSTS.map((host) => (
              <li key={host} className="rounded-lg border p-3 text-sm">
                <button
                  type="button"
                  className="font-medium underline-offset-2 hover:underline"
                  onClick={() => void upstart.invoke("export:open-host", host)}
                >
                  {t.export.hosts[host].name}
                </button>
                <p className="mt-1 text-muted-foreground">{t.export.hosts[host].how}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">{t.export.step3}</h3>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void saveUrl();
            }}
          >
            <input
              type="url"
              value={siteUrl}
              onChange={(event) => setSiteUrl(event.target.value)}
              placeholder="https://"
              aria-label={t.export.siteUrl}
              data-testid="export-site-url"
              className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
            />
            <Button type="submit" variant="outline" data-testid="export-site-url-save">
              {t.export.save}
            </Button>
          </form>
          {urlError && <p className="text-sm text-destructive">{urlError}</p>}
          <p className="text-xs text-muted-foreground">{t.export.siteUrlHelp}</p>
        </section>
      </div>
    </div>
  );
}
