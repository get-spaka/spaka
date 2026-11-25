// A website's own settings (Q118), as a dialog centred on Spaka's window,
// opened from the button on its row in the websites list or the one before its
// name over the conversation: its model and effort, its
// own skills and connectors, all kept in its folder; and which connectors it
// also gets from the settings for every website. A click on its name, the
// dialog's title, renames it, as a double-click on its row does.
import { House } from "lucide-react";
import { useEffect, useState } from "react";
import type { AgentStatus, ConnectorInfo, ProjectInfo, SiteCheck, SkillInfo } from "../../shared/ipc";
import { spaka } from "../lib/bridge";
import { messageOf } from "../lib/errors";
import { t } from "../lib/strings";
import { ConnectorList, SkillList } from "../settings/lists";
import { ModelRows } from "../settings/model";
import { Group, Push, Row } from "../settings/ui";
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
