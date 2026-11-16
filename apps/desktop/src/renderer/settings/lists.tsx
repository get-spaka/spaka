// The lists of skills and connectors (ADR 0010), in the settings window for
// every website and in a website's own settings (Q118): a row is chosen with a
// click, + adds and − removes the chosen one, as in macOS.
import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { ConnectorInfo, ConnectorScope, SkillInfo } from "../../shared/ipc";
import { Tip } from "../components/ui/tip";
import { upstart } from "../lib/bridge";
import { messageOf } from "../lib/errors";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";
import { Group, inputClass, ListBar, Push, selectClass } from "./ui";

export function SkillList({
  origin,
  title,
  skills,
  caption,
  addLabel = t.settings.skills.add,
}: {
  /** The maker's own skills only: the ones built into Upstart are not listed (Q123). */
  origin: Exclude<SkillInfo["origin"], "upstart">;
  title: string;
  skills: SkillInfo[];
  caption?: React.ReactNode;
  addLabel?: string;
}) {
  const [chosen, setChosen] = useState<string>();
  const [error, setError] = useState<string>();
  const run = async (action: () => Promise<unknown>) => {
    setError(undefined);
    try {
      await action();
    } catch (e) {
      setError(messageOf(e));
    }
  };
  const add = () =>
    run(async () => {
      const folder = await upstart.invoke("skills:choose-folder");
      if (folder) await upstart.invoke("skills:add", origin, folder);
    });
  const exists = skills.some((s) => s.name === chosen);
  return (
    <Group
      title={title}
      testid={`skills-${origin}`}
      caption={
        (error || caption) && (
          <>
            {error && <p className="text-destructive">{error}</p>}
            {caption}
          </>
        )
      }
      footer={
        <ListBar
          testid={`skills-${origin}`}
          addLabel={addLabel}
          removeLabel={t.settings.skills.remove}
          onAdd={() => void add()}
          canRemove={exists}
          onRemove={() => chosen && void run(() => upstart.invoke("skills:remove", origin, chosen))}
        />
      }
    >
      {skills.length === 0 ? (
        <p className="px-3 py-2.5 text-[13px] text-muted-foreground">{t.skills.noneYet}</p>
      ) : (
        skills.map((skill) => (
          <Tip key={skill.name} text={t.settings.skills.chooseTip}>
            <button
              type="button"
              data-testid="skill"
              data-name={skill.name}
              aria-pressed={chosen === skill.name}
              onClick={() => setChosen(skill.name)}
              className={cn(
                "flex w-full flex-col gap-0.5 px-3 py-2 text-left",
                chosen === skill.name && "bg-primary text-primary-foreground",
              )}
            >
              <span className="font-mono text-[13px]">{skill.name}</span>
              <span
                className={cn(
                  "line-clamp-2 text-[11px]",
                  chosen === skill.name ? "text-primary-foreground/80" : "text-muted-foreground",
                )}
              >
                {skill.description}
              </span>
            </button>
          </Tip>
        ))
      )}
    </Group>
  );
}

export function ConnectorList({
  scope,
  title,
  connectors,
  caption,
  addLabel = t.settings.connectors.add,
}: {
  scope: ConnectorScope;
  title?: string;
  connectors: ConnectorInfo[];
  caption?: React.ReactNode;
  addLabel?: string;
}) {
  const [chosen, setChosen] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string>();
  const exists = connectors.some((c) => c.name === chosen);
  const remove = async () => {
    if (!chosen) return;
    setError(undefined);
    try {
      await upstart.invoke("connectors:remove", scope, chosen);
    } catch (e) {
      setError(messageOf(e));
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <Group
        title={title}
        testid={`connectors-${scope}`}
        caption={
          (error || caption) && (
            <>
              {error && <p className="text-destructive">{error}</p>}
              {caption}
            </>
          )
        }
        footer={
          <ListBar
            testid={`connectors-${scope}`}
            addLabel={addLabel}
            removeLabel={t.settings.connectors.remove}
            onAdd={() => setAdding(true)}
            canRemove={exists}
            onRemove={() => void remove()}
          />
        }
      >
        {connectors.length === 0 ? (
          <p className="px-3 py-2.5 text-[13px] text-muted-foreground">{t.skills.noneYet}</p>
        ) : (
          connectors.map((c) => (
            <ConnectorRow key={c.name} connector={c} chosen={chosen === c.name} onChoose={() => setChosen(c.name)} />
          ))
        )}
      </Group>
      {adding && <AddConnector scope={scope} onDone={() => setAdding(false)} />}
    </div>
  );
}

function ConnectorRow({
  connector: c,
  chosen,
  onChoose,
}: {
  connector: ConnectorInfo;
  chosen: boolean;
  onChoose: () => void;
}) {
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
    <div data-testid="connector" data-name={c.name} data-state={c.state} className="flex flex-col">
      {/* Its tip also gives the address or command in full, which the row cuts short. */}
      <Tip text={t.settings.connectors.chooseTip(c.target)}>
        <button
          type="button"
          aria-pressed={chosen}
          onClick={onChoose}
          className={cn(
            "flex w-full items-center gap-3 px-3 py-2 text-left",
            chosen && "bg-primary text-primary-foreground",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold uppercase",
              chosen ? "bg-primary-foreground/15" : "bg-muted",
            )}
          >
            {c.name.slice(0, 1)}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="font-mono text-[13px]">{c.name}</span>
            <span
              className={cn("truncate text-[11px]", chosen ? "text-primary-foreground/80" : "text-muted-foreground")}
            >
              {t.connectors.kind[c.kind]} · {c.target}
              {c.oauth?.clientId && (
                <span data-testid="connector-app">
                  {" "}
                  · {t.connectors.registeredApp(c.oauth.clientId, c.oauth.callbackPort)}
                </span>
              )}
            </span>
          </span>
          <span data-testid="connector-state" className="flex shrink-0 items-center gap-1.5 text-xs">
            <span aria-hidden="true" className={cn("size-2 rounded-full", dot(c))} />
            <span className={chosen ? undefined : tone(c)}>{stateLabel(c)}</span>
          </span>
        </button>
      </Tip>
      {c.state === "needs-approval" && (
        <div className="mx-3 mb-2.5 flex flex-col gap-2 rounded-md border border-warning/40 bg-warning-muted p-2.5 text-xs">
          <p className="flex gap-2">
            <TriangleAlert className="size-4 shrink-0 text-warning" />
            {t.connectors.approvalWarning}
          </p>
          <code className="rounded bg-card px-2 py-1 break-all">{c.target}</code>
          <div>
            <Push
              testid="connector-approve"
              tip={t.connectors.approveTip}
              onClick={() => void run(() => upstart.invoke("connectors:approve", c.name))}
            >
              {t.connectors.approve}
            </Push>
          </div>
        </div>
      )}
      {c.state === "on" && c.status === "needs-auth" && (
        <div className="mx-3 mb-2.5 flex flex-col gap-2 text-xs">
          <div>
            <Push
              testid="connector-sign-in"
              tip={t.connectors.signInTip}
              onClick={() =>
                void run(async () => {
                  await upstart.invoke("connectors:sign-in", c.name);
                  setSigningIn(true);
                })
              }
            >
              {t.connectors.signIn}
            </Push>
          </div>
          {signingIn && <p className="text-muted-foreground">{t.connectors.signInWaiting}</p>}
        </div>
      )}
      {c.state === "needs-secret" && (
        <form
          className="mx-3 mb-2.5 flex flex-wrap items-center gap-2"
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
              className={cn(inputClass, "flex-1")}
              data-testid="connector-secret"
            />
          ))}
          <Push type="submit" testid="connector-secret-save" tip={t.connectors.saveTip}>
            {t.connectors.save}
          </Push>
        </form>
      )}
      {error && <p className="mx-3 mb-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function stateLabel(c: ConnectorInfo): string {
  if (c.state !== "on") return t.connectors.state[c.state];
  if (!c.status) return t.connectors.state.on;
  if (c.status === "failed" && c.error) return `${t.connectors.status.failed}: ${c.error}`;
  return t.connectors.status[c.status];
}

function tone(c: ConnectorInfo): string {
  if (c.state === "needs-approval" || c.state === "needs-secret") return "text-warning";
  if (c.status === "failed" || c.status === "needs-auth") return "text-destructive";
  if (c.status === "connected") return "text-success";
  return "text-muted-foreground";
}

function dot(c: ConnectorInfo): string {
  if (c.state === "needs-approval" || c.state === "needs-secret" || c.status === "needs-auth") return "bg-warning";
  if (c.status === "failed") return "bg-destructive";
  if (c.status === "connected") return "bg-success";
  return "bg-muted-foreground/50";
}

function AddConnector({ scope, onDone }: { scope: ConnectorScope; onDone: () => void }) {
  const [kind, setKind] = useState<"remote" | "local">("remote");
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [secretName, setSecretName] = useState("");
  const [secretValue, setSecretValue] = useState("");
  const [oauth, setOauth] = useState({ clientId: "", callbackPort: "", authServerMetadataUrl: "" });
  const [error, setError] = useState<string | null>(null);

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
      onDone();
    } catch (e) {
      setError(messageOf(e));
    }
  };

  return (
    <form
      data-testid="connector-form"
      className="flex flex-col gap-2.5 rounded-[10px] border border-border bg-card p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={t.connectors.kindLabel}
          value={kind}
          onChange={(event) => setKind(event.target.value as "remote" | "local")}
          className={selectClass}
          data-testid="connector-kind"
        >
          <option value="remote">{t.connectors.kind.remote}</option>
          <option value="local">{t.connectors.kind.local}</option>
        </select>
        <input
          aria-label={t.connectors.name}
          placeholder={t.connectors.name}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={cn(inputClass, "flex-1")}
          data-testid="connector-name"
        />
      </div>
      <input
        aria-label={kind === "remote" ? t.connectors.url : t.connectors.command}
        placeholder={
          kind === "remote"
            ? `${t.connectors.url}: https://…`
            : `${t.connectors.command}: ${t.connectors.commandExample}`
        }
        value={target}
        onChange={(event) => setTarget(event.target.value)}
        className={cn(inputClass, "font-mono")}
        data-testid="connector-target"
      />
      {kind === "local" && <p className="text-[11px] text-muted-foreground">{t.connectors.localWarning}</p>}
      <div className="flex flex-wrap gap-2">
        <input
          aria-label={kind === "remote" ? t.connectors.header : t.connectors.variable}
          placeholder={kind === "remote" ? t.connectors.header : t.connectors.variable}
          value={secretName}
          onChange={(event) => setSecretName(event.target.value)}
          className={cn(inputClass, "w-52 font-mono")}
          data-testid="connector-secret-name"
        />
        <input
          type="password"
          aria-label={t.connectors.value}
          placeholder={t.connectors.value}
          value={secretValue}
          onChange={(event) => setSecretValue(event.target.value)}
          className={cn(inputClass, "flex-1")}
          data-testid="connector-secret-value"
        />
      </div>
      <p className="text-[11px] text-muted-foreground">{t.connectors.secretHelp}</p>
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
                className={cn(inputClass, width, "font-mono")}
                data-testid={`connector-oauth-${key}`}
              />
            ))}
          </div>
        </details>
      )}
      {error && (
        <p className="text-[13px] text-destructive" data-testid="connector-error">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Push tip={t.connectors.cancelTip} onClick={onDone}>
          {t.connectors.cancel}
        </Push>
        <Push type="submit" primary testid="connector-add" tip={t.connectors.addSubmitTip}>
          {t.connectors.addSubmit}
        </Push>
      </div>
    </form>
  );
}
