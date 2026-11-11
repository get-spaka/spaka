// A website's own settings (Q118), as a sheet over Upstart's window, opened
// from the button on its row in the websites list: its model and effort, its
// own skills and connectors, all kept in its folder; and which connectors it
// also gets from the settings for every website.
import { House } from "lucide-react";
import { useEffect } from "react";
import type { AgentStatus, ConnectorInfo, ProjectInfo, SkillInfo } from "../../shared/ipc";
import { upstart } from "../lib/bridge";
import { t } from "../lib/strings";
import { ConnectorList, SkillList } from "../settings/lists";
import { ModelRows } from "../settings/model";
import { Group, Push } from "../settings/ui";

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
  const shared = connectors.filter((c) => c.scope === "app").map((c) => c.name);

  return (
    <div
      className="absolute inset-0 z-20 flex items-start justify-center bg-black/15"
      data-testid="site-settings-backdrop"
    >
      <section
        role="dialog"
        aria-label={t.site.open(project.name)}
        data-testid="site-settings"
        className="flex max-h-[85%] w-[560px] flex-col gap-4 overflow-y-auto rounded-b-xl border border-t-0 border-neutral-300 bg-[#f7f7f8] px-5 pt-4 pb-4 text-[13px] text-neutral-950 shadow-[0_18px_40px_rgba(0,0,0,0.22)]"
      >
        <header className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-[9px] border border-neutral-200 bg-white"
          >
            <House className="size-[18px]" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <h2 className="truncate text-[15px] font-semibold">{project.name}</h2>
            <span className="text-[11px] text-neutral-600">{t.site.kept}</span>
          </span>
        </header>

        <Group title={t.site.agent}>
          <ModelRows
            idPrefix="site"
            models={status.models}
            model={project.model}
            effort={project.effort}
            onChange={(next) => {
              if (next.model) void upstart.invoke("agent:set-model", next.model);
              if (next.effort) void upstart.invoke("agent:set-effort", next.effort);
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
              <button
                type="button"
                className="underline underline-offset-2 hover:text-neutral-950"
                onClick={() => void upstart.invoke("settings:open", "connectors")}
                data-testid="site-open-settings"
              >
                {t.site.fromSettings}
              </button>
            </span>
          }
        />

        <div className="flex justify-end">
          <Push primary onClick={onClose} testid="site-settings-done">
            {t.site.done}
          </Push>
        </div>
      </section>
    </div>
  );
}
