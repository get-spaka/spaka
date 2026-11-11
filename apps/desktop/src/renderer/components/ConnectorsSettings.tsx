import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { ConnectorInfo, ConnectorScope, ProjectInfo } from "../../shared/ipc";
import { upstart } from "../lib/bridge";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";
import { messageOf } from "./SettingsDialog";
import { Button } from "./ui/button";

const field =
  "h-8 min-w-0 rounded-md border bg-background px-2.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30";

/** Connectors (ADR 0010): for this website or all of them, with what keeps each off. */
export function ConnectorsSettings({
  project,
  connectors,
}: {
  project: ProjectInfo | null;
  connectors: ConnectorInfo[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h3 className="text-base font-medium">{t.connectors.title}</h3>
        <p className="text-sm text-muted-foreground">{t.connectors.intro}</p>
      </section>
      <ConnectorGroup
        title={project ? t.skills.project(project.name) : t.skills.projectNone}
        connectors={connectors.filter((c) => c.scope === "project")}
        scope="project"
        disabled={!project}
      />
      <ConnectorGroup title={t.skills.app} connectors={connectors.filter((c) => c.scope === "app")} scope="app" />
      <AddConnector hasProject={!!project} />
    </div>
  );
}

function ConnectorGroup({
  title,
  connectors,
  scope,
  disabled,
}: {
  title: string;
  connectors: ConnectorInfo[];
  scope: ConnectorScope;
  disabled?: boolean;
}) {
  return (
    <section className="flex flex-col gap-2" data-testid={`connectors-${scope}`}>
      <h4 className="text-sm font-medium">{title}</h4>
      {connectors.length === 0 ? (
        <p className="text-sm text-muted-foreground">{disabled ? t.skills.none : t.skills.noneYet}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {connectors.map((c) => (
            <ConnectorRow key={c.name} connector={c} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ConnectorRow({ connector: c }: { connector: ConnectorInfo }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(messageOf(e));
    }
  };
  const missing = c.secrets.filter((s) => !s.set);
  return (
    <li
      data-testid="connector"
      data-name={c.name}
      data-state={c.state}
      className="group flex flex-col gap-2 px-3 py-2.5"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm">{c.name}</span>
            <span className="text-xs text-muted-foreground">{t.connectors.kind[c.kind]}</span>
          </div>
          <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground" title={c.target}>
            {c.target}
          </div>
          {c.oauth?.clientId && (
            <div className="mt-0.5 truncate text-xs text-muted-foreground" data-testid="connector-app">
              {t.connectors.registeredApp(c.oauth.clientId, c.oauth.callbackPort)}
            </div>
          )}
        </div>
        <span data-testid="connector-state" className={cn("shrink-0 text-xs", stateTone(c))}>
          {stateLabel(c)}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          title={t.connectors.remove}
          onClick={() => void run(() => upstart.invoke("connectors:remove", c.scope, c.name))}
          data-testid="connector-remove"
        >
          <Trash2 />
        </Button>
      </div>
      {c.state === "needs-approval" && (
        <div className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs">
          <p className="flex gap-2">
            <TriangleAlert className="size-4 shrink-0 text-amber-600" />
            {t.connectors.approvalWarning}
          </p>
          <code className="rounded bg-muted px-2 py-1 break-all">{c.target}</code>
          <div>
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => void run(() => upstart.invoke("connectors:approve", c.name))}
              data-testid="connector-approve"
            >
              {t.connectors.approve}
            </Button>
          </div>
        </div>
      )}
      {c.state === "on" && c.status === "needs-auth" && (
        <div className="flex flex-col gap-2 text-xs">
          <div>
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() =>
                void run(async () => {
                  await upstart.invoke("connectors:sign-in", c.name);
                  setSigningIn(true);
                })
              }
              data-testid="connector-sign-in"
            >
              {t.connectors.signIn}
            </Button>
          </div>
          {signingIn && <p className="text-muted-foreground">{t.connectors.signInWaiting}</p>}
        </div>
      )}
      {c.state === "needs-secret" && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => upstart.invoke("connectors:set-secrets", c.scope, c.name, values));
          }}
        >
          {missing.map((s) => (
            <input
              key={s.name}
              type="password"
              aria-label={s.name}
              placeholder={s.name}
              value={values[s.name] ?? ""}
              onChange={(event) => setValues((v) => ({ ...v, [s.name]: event.target.value }))}
              className={cn(field, "flex-1")}
              data-testid="connector-secret"
            />
          ))}
          <Button type="submit" size="sm" variant="outline" className="h-8" data-testid="connector-secret-save">
            {t.connectors.save}
          </Button>
        </form>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </li>
  );
}

function stateLabel(c: ConnectorInfo): string {
  if (c.state !== "on") return t.connectors.state[c.state];
  if (!c.status) return t.connectors.state.on;
  if (c.status === "failed" && c.error) return `${t.connectors.status.failed}: ${c.error}`;
  return t.connectors.status[c.status];
}

function stateTone(c: ConnectorInfo): string {
  if (c.state === "needs-approval" || c.state === "needs-secret") return "text-amber-600";
  if (c.status === "failed" || c.status === "needs-auth") return "text-destructive";
  if (c.status === "connected") return "text-emerald-600";
  return "text-muted-foreground";
}

function AddConnector({ hasProject }: { hasProject: boolean }) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<ConnectorScope>(hasProject ? "project" : "app");
  const [kind, setKind] = useState<"remote" | "local">("remote");
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [secretName, setSecretName] = useState("");
  const [secretValue, setSecretValue] = useState("");
  const [oauth, setOauth] = useState({ clientId: "", callbackPort: "", authServerMetadataUrl: "" });
  const [error, setError] = useState<string | null>(null);

  if (!open)
    return (
      <div>
        <Button variant="outline" size="sm" className="h-7" onClick={() => setOpen(true)} data-testid="connector-new">
          <Plus />
          {t.connectors.add}
        </Button>
      </div>
    );

  const submit = async () => {
    setError(null);
    try {
      await upstart.invoke("connectors:add", scope, {
        name,
        kind,
        target,
        secrets: secretName.trim() ? [{ name: secretName, value: secretValue }] : [],
        ...(kind === "remote" ? { oauth } : {}),
      });
      setOpen(false);
      setName("");
      setTarget("");
      setSecretName("");
      setSecretValue("");
      setOauth({ clientId: "", callbackPort: "", authServerMetadataUrl: "" });
    } catch (e) {
      setError(messageOf(e));
    }
  };

  return (
    <form
      data-testid="connector-form"
      className="flex flex-col gap-3 rounded-lg border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex flex-wrap gap-2">
        <select
          aria-label={t.connectors.scope}
          value={scope}
          onChange={(event) => setScope(event.target.value as ConnectorScope)}
          className={field}
          data-testid="connector-scope"
        >
          {hasProject && <option value="project">{t.connectors.forProject}</option>}
          <option value="app">{t.skills.app}</option>
        </select>
        <select
          aria-label={t.connectors.kindLabel}
          value={kind}
          onChange={(event) => setKind(event.target.value as "remote" | "local")}
          className={field}
          data-testid="connector-kind"
        >
          <option value="remote">{t.connectors.kind.remote}</option>
          <option value="local">{t.connectors.kind.local}</option>
        </select>
      </div>
      <input
        aria-label={t.connectors.name}
        placeholder={t.connectors.name}
        value={name}
        onChange={(event) => setName(event.target.value)}
        className={field}
        data-testid="connector-name"
      />
      <input
        aria-label={kind === "remote" ? t.connectors.url : t.connectors.command}
        placeholder={kind === "remote" ? "https://" : t.connectors.commandExample}
        value={target}
        onChange={(event) => setTarget(event.target.value)}
        className={cn(field, "font-mono")}
        data-testid="connector-target"
      />
      {kind === "local" && <p className="text-xs text-muted-foreground">{t.connectors.localWarning}</p>}
      <div className="flex flex-wrap gap-2">
        <input
          aria-label={kind === "remote" ? t.connectors.header : t.connectors.variable}
          placeholder={kind === "remote" ? t.connectors.header : t.connectors.variable}
          value={secretName}
          onChange={(event) => setSecretName(event.target.value)}
          className={cn(field, "w-48 font-mono")}
          data-testid="connector-secret-name"
        />
        <input
          type="password"
          aria-label={t.connectors.value}
          placeholder={t.connectors.value}
          value={secretValue}
          onChange={(event) => setSecretValue(event.target.value)}
          className={cn(field, "flex-1")}
          data-testid="connector-secret-value"
        />
      </div>
      <p className="text-xs text-muted-foreground">{t.connectors.secretHelp}</p>
      {kind === "remote" && (
        <details className="text-xs" data-testid="connector-sign-in-settings">
          <summary className="cursor-pointer text-muted-foreground">{t.connectors.signInSettings}</summary>
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-muted-foreground">{t.connectors.signInSettingsHelp}</p>
            {(
              [
                ["clientId", t.connectors.clientId, "w-full"],
                ["callbackPort", t.connectors.callbackPort, "w-32"],
                ["authServerMetadataUrl", t.connectors.metadataUrl, "w-full"],
              ] as const
            ).map(([key, label, width]) => (
              <input
                key={key}
                aria-label={label}
                placeholder={label}
                value={oauth[key]}
                inputMode={key === "callbackPort" ? "numeric" : undefined}
                onChange={(event) => setOauth((o) => ({ ...o, [key]: event.target.value }))}
                className={cn(field, width, "font-mono")}
                data-testid={`connector-oauth-${key}`}
              />
            ))}
          </div>
        </details>
      )}
      {error && (
        <p className="text-sm text-destructive" data-testid="connector-error">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" data-testid="connector-add">
          {t.connectors.addSubmit}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t.connectors.cancel}
        </Button>
      </div>
    </form>
  );
}
