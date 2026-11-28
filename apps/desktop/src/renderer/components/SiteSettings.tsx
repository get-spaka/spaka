// A website's own settings (Q118), as a dialog centred on Spaka's window,
// opened from the button on its row in the websites list or the one before its
// name over the conversation: its model and effort, its
// own skills and connectors, all kept in its folder; and which connectors it
// also gets from the settings for every website; its packages (Q520). A click on its name, the
// dialog's title, renames it, as a double-click on its row does.
import { Eye, EyeOff, House } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  AgentStatus,
  ConnectorInfo,
  PackageInfo,
  ProjectInfo,
  SecretInfo,
  SiteCheck,
  SkillInfo,
} from "../../shared/ipc";
import { spaka } from "../lib/bridge";
import { messageOf } from "../lib/errors";
import { t } from "../lib/strings";
import { ConnectorList, SkillList } from "../settings/lists";
import { ModelRows } from "../settings/model";
import { Group, ListBar, Push, Row } from "../settings/ui";
import { RenameField } from "./RenameField";
import { Tip } from "./ui/tip";

export function SiteSettings({
  project,
  status,
  skills,
  connectors,
  onClose,
}: {
  project: ProjectInfo;
  status: AgentStatus;
  skills: SkillInfo[];
  connectors: ConnectorInfo[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const [renaming, setRenaming] = useState(false);
  const shared = connectors.filter((c) => c.scope === "app").map((c) => c.name);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a click beside it is for the pointer; Escape and Done do the same from the keyboard
    <div
      className="no-drag absolute inset-0 z-20 flex items-center justify-center bg-scrim p-6 animate-in fade-in-0"
      data-testid="site-settings-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t.site.open(project.name)}
        data-testid="site-settings"
        className="flex max-h-full w-[560px] flex-col gap-4 overflow-y-auto rounded-xl border border-input bg-panel px-5 pt-4 pb-4 text-[13px] text-foreground shadow-[0_18px_40px_rgba(0,0,0,0.22)] animate-in fade-in-0 zoom-in-95"
      >
        <header className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-[9px] border border-border bg-card"
          >
            <House className="size-[18px]" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            {renaming ? (
              <RenameField
                name={project.name}
                testid="site-rename"
                className="-mx-[7px] px-[6px] py-0 text-[15px] font-semibold"
                onDone={(name) => {
                  setRenaming(false);
                  const clean = name?.trim();
                  if (clean && clean !== project.name) void spaka.invoke("projects:rename", project.id, clean);
                }}
              />
            ) : (
              <h2 className="flex min-w-0">
                <Tip text={t.site.renameTip}>
                  <button
                    type="button"
                    data-testid="site-name"
                    onClick={() => setRenaming(true)}
                    className="-mx-[7px] min-w-0 truncate rounded-sm border border-transparent px-[6px] text-left text-[15px] font-semibold hover:border-input focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    {project.name}
                  </button>
                </Tip>
              </h2>
            )}
            <span className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
              <span className="shrink-0">{t.site.keptIn}</span>
              {/* Its folder, project-<random id> (Q410): a rename never changes it. */}
              <Tip text={t.site.folderTip(project.path)}>
                <button
                  type="button"
                  data-testid="site-folder"
                  onClick={() => void spaka.invoke("projects:reveal")}
                  className="min-w-0 truncate font-mono underline-offset-2 hover:text-foreground hover:underline"
                >
                  {project.path.split(/[\\/]/).pop()}
                </button>
              </Tip>
              <span className="shrink-0">{t.site.keptAfter}</span>
            </span>
          </span>
        </header>

        <Group title={t.site.agent}>
          <ModelRows
            idPrefix="site"
            models={status.models}
            model={project.model}
            effort={project.effort}
            onChange={(next) => {
              if (next.model) void spaka.invoke("agent:set-model", next.model);
              if (next.effort) void spaka.invoke("agent:set-effort", next.effort);
            }}
          />
        </Group>

        <SkillList
          origin="project"
          title={t.site.ownSkills}
          skills={skills.filter((s) => s.origin === "project")}
          addLabel={t.site.addSkill}
        />

        <ConnectorList
          scope="project"
          title={t.site.ownConnectors}
          connectors={connectors.filter((c) => c.scope === "project")}
          addLabel={t.site.addConnector}
          caption={
            <span data-testid="site-shared-connectors">
              {shared.length ? t.site.alsoUsed(shared.join(", ")) : t.site.noneShared}{" "}
              <Tip text={t.site.fromSettingsTip}>
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => void spaka.invoke("settings:open", "connectors")}
                  data-testid="site-open-settings"
                >
                  {t.site.fromSettings}
                </button>
              </Tip>
            </span>
          }
        />

        <Packages projectId={project.id} />

        <Secrets projectId={project.id} />

        <PublishedSite project={project} />

        <div className="flex justify-end">
          <Push primary onClick={onClose} tip={t.site.doneTip} testid="site-settings-done">
            {t.site.done}
          </Push>
        </div>
      </section>
    </div>
  );
}

/** What a package weighs for visitors, once known. */
const weight = (bytes: number) => (bytes < 1000 ? `${bytes} B` : `${Math.round(bytes / 100) / 10} kB`);

/** The website's packages (Q520): name, version, licence, source, side and weight, and Remove. */
function Packages({ projectId }: { projectId: string }) {
  const p = t.packages;
  const [list, setList] = useState<PackageInfo[]>([]);
  const [error, setError] = useState<string>();
  useEffect(() => {
    const load = () => void spaka.invoke("packages:list").then(setList);
    load();
    return spaka.on("packages:changed", (id) => {
      if (id === projectId) load();
    });
  }, [projectId]);
  const remove = async (name: string) => {
    if (!window.confirm(p.removeConfirm(name))) return;
    setError(undefined);
    try {
      setList(await spaka.invoke("packages:remove", name));
    } catch (e) {
      setError(messageOf(e));
    }
  };
  return (
    <Group
      title={p.title}
      caption={error ? <span className="text-destructive">{error}</span> : p.caption}
      testid="site-packages"
    >
      {list.length === 0 ? (
        <p className="px-3 py-2.5 text-[13px] text-muted-foreground">{p.none}</p>
      ) : (
        list.map((pkg) => (
          <Row
            key={pkg.name}
            label={
              <span data-testid="package" data-name={pkg.name}>
                {pkg.name} <span className="text-muted-foreground">{pkg.version ?? p.notInstalled}</span>
              </span>
            }
            detail={[
              pkg.license,
              p.source,
              (pkg.sides.length ? pkg.sides : (["none"] as const)).map((side) => p.sides[side]).join(", "),
              pkg.weight !== undefined ? p.weight(weight(pkg.weight)) : undefined,
            ]
              .filter(Boolean)
              .join(" · ")}
          >
            <Push testid="package-remove" tip={p.removeTip(pkg.name)} onClick={() => void remove(pkg.name)}>
              {p.remove}
            </Push>
          </Row>
        ))
      )}
    </Group>
  );
}

/**
 * The website's secrets (Q558): never shown once given, only replaced or
 * removed; those its server modules read without a value are missing, their
 * field in place.
 */
function Secrets({ projectId }: { projectId: string }) {
  const s = t.secrets;
  const [list, setList] = useState<SecretInfo[]>([]);
  const [editing, setEditing] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    const load = () => void spaka.invoke("secrets:list").then(setList);
    load();
    return spaka.on("secrets:changed", (id) => {
      if (id === projectId) load();
    });
  }, [projectId]);
  const run = async (work: () => Promise<SecretInfo[]>) => {
    setError(undefined);
    try {
      setList(await work());
      return true;
    } catch (e) {
      setError(messageOf(e));
      return false;
    }
  };
  const save = async (name: string, value: string) => {
    if (await run(() => spaka.invoke("secrets:set", name, value))) {
      setEditing(undefined);
      setAdding(false);
    }
  };
  const remove = (name: string) => {
    if (window.confirm(s.removeConfirm(name))) void run(() => spaka.invoke("secrets:remove", name));
  };
  const date = (at: string) => new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return (
    <Group
      title={s.title}
      caption={error ? <span className="text-destructive">{error}</span> : s.caption}
      testid="site-secrets"
      footer={<ListBar testid="secrets" addLabel={s.add} onAdd={() => setAdding(true)} />}
    >
      {list.length === 0 && !adding ? (
        <p className="px-3 py-2.5 text-[13px] text-muted-foreground">{s.none}</p>
      ) : (
        list.map((secret) => (
          <Row
            key={secret.name}
            label={
              <span data-testid="secret" data-name={secret.name} data-set={secret.set ? "true" : "false"}>
                <span className="font-mono text-[12.5px]">{secret.name}</span>
              </span>
            }
            detail={
              secret.set
                ? [secret.purpose, secret.at && s.setOn(date(secret.at))].filter(Boolean).join(" · ") || undefined
                : `${secret.readBy.length ? s.readBy(secret.readBy) : ""}, ${s.noValue}`.replace(/^, /, "")
            }
          >
            {secret.set && editing !== secret.name ? (
              <>
                <span className="rounded-full bg-muted px-2 py-px text-[11px] text-success">{s.set}</span>
                <Push testid="secret-replace" tip={s.replaceTip(secret.name)} onClick={() => setEditing(secret.name)}>
                  {s.replace}
                </Push>
                <Push testid="secret-remove" tip={s.removeTip(secret.name)} onClick={() => remove(secret.name)}>
                  {s.remove}
                </Push>
              </>
            ) : (
              <>
                {!secret.set && (
                  <span className="rounded-full bg-warning-muted px-2 py-px text-[11px] text-warning">{s.missing}</span>
                )}
                <SecretValue
                  name={secret.name}
                  onSave={(value) => void save(secret.name, value)}
                  onCancel={secret.set ? () => setEditing(undefined) : undefined}
                />
              </>
            )}
          </Row>
        ))
      )}
      {adding && <NewSecret onSave={(name, value) => void save(name, value)} onCancel={() => setAdding(false)} />}
    </Group>
  );
}

/** A masked field and its Save, for a secret's value: what is typed is shown only on demand. */
function SecretValue({
  name,
  onSave,
  onCancel,
}: {
  name: string;
  onSave: (value: string) => void;
  onCancel?: () => void;
}) {
  const s = t.secrets;
  const [value, setValue] = useState("");
  const [shown, setShown] = useState(false);
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSave(value);
      }}
    >
      <span className="flex w-44 items-center rounded-md border border-input bg-card pr-1 focus-within:border-ring">
        <input
          type={shown ? "text" : "password"}
          data-testid="secret-value-field"
          aria-label={name}
          placeholder={s.valuePlaceholder}
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-w-0 flex-1 bg-transparent px-2 py-1 font-mono text-[12px] outline-none"
        />
        <Tip text={shown ? s.hide : s.show}>
          <button
            type="button"
            aria-label={shown ? s.hide : s.show}
            onClick={() => setShown((v) => !v)}
            className="text-muted-foreground hover:text-foreground"
          >
            {shown ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        </Tip>
      </span>
      {onCancel && (
        <Push tip={s.cancel} onClick={onCancel}>
          {s.cancel}
        </Push>
      )}
      <Push type="submit" primary testid="secret-save" tip={s.save} disabled={!value.trim()}>
        {s.save}
      </Push>
    </form>
  );
}

/** A secret added by hand: its name, then its value. */
function NewSecret({ onSave, onCancel }: { onSave: (name: string, value: string) => void; onCancel: () => void }) {
  const s = t.secrets;
  const [name, setName] = useState("");
  return (
    <div className="flex min-h-11 flex-wrap items-center gap-2 px-3 py-2">
      <input
        data-testid="secret-name-field"
        aria-label={s.namePlaceholder}
        placeholder={s.namePlaceholder}
        autoComplete="off"
        spellCheck={false}
        value={name}
        onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
        className="min-w-0 flex-1 rounded-md border border-input bg-card px-2 py-1 font-mono text-[12px] outline-none focus:border-ring"
      />
      <SecretValue name={name || s.namePlaceholder} onSave={(value) => onSave(name, value)} onCancel={onCancel} />
    </div>
  );
}

/** The published site (Q183): its address, checked with the website's management token, and that token. */
function PublishedSite({ project }: { project: ProjectInfo }) {
  const p = t.site.published;
  const [address, setAddress] = useState(project.siteUrl ?? "");
  const [check, setCheck] = useState<SiteCheck | "checking">();
  const [error, setError] = useState<string>();
  const [token, setToken] = useState<string>();
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    void spaka.invoke("site:token").then(setToken);
  }, []);
  const save = async () => {
    setError(undefined);
    setCheck(undefined);
    try {
      await spaka.invoke("projects:set-site-url", address);
      if (address.trim()) {
        setCheck("checking");
        setCheck(await spaka.invoke("site:check"));
      }
    } catch (e) {
      setError(messageOf(e));
    }
  };
  return (
    <Group title={p.title} caption={p.caption} testid="site-published">
      <Row label={p.address} htmlFor="site-address">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <input
            id="site-address"
            data-testid="site-address"
            value={address}
            placeholder={p.addressPlaceholder}
            onChange={(e) => setAddress(e.target.value)}
            className="w-64 rounded-md border border-input bg-card px-2 py-1 text-[13px] outline-none focus:border-ring"
          />
          <Push
            type="submit"
            testid="site-address-save"
            tip={address.trim() && address.trim() === (project.siteUrl ?? "") ? p.checkTip : p.saveTip}
          >
            {address.trim() && address.trim() === (project.siteUrl ?? "") ? p.check : p.save}
          </Push>
        </form>
      </Row>
      {(check || error) && (
        <div
          data-testid="site-check"
          data-ok={check !== "checking" && check?.ok ? "true" : "false"}
          className={`px-3 py-2 text-[11px] ${error || (check !== "checking" && check && !check.ok) ? "text-destructive" : "text-muted-foreground"}`}
        >
          {error ?? (check === "checking" ? p.checking : check?.ok ? p.ok : check?.message)}
        </div>
      )}
      <Row label={p.token} detail={p.tokenDetail}>
        <code data-testid="site-token" className="max-w-48 truncate font-mono text-[12px]">
          {token ? (shown ? token : "•".repeat(12)) : ""}
        </code>
        <Push testid="site-token-show" tip={shown ? p.hideTip : p.showTip} onClick={() => setShown((s) => !s)}>
          {shown ? p.hide : p.show}
        </Push>
        <Push
          testid="site-token-copy"
          tip={p.copyTip}
          onClick={() => {
            if (!token) return;
            void navigator.clipboard.writeText(token).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? p.copied : p.copy}
        </Push>
        <Push
          testid="site-token-new"
          tip={p.newTokenTip}
          onClick={() => {
            if (!window.confirm(p.newTokenConfirm)) return;
            void spaka.invoke("site:new-token").then((next) => {
              setToken(next);
              setShown(true);
            });
          }}
        >
          {p.newToken}
        </Push>
      </Row>
    </Group>
  );
}
