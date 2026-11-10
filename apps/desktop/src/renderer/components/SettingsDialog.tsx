import { Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ProjectInfo, SkillInfo } from "../../shared/ipc";
import { upstart } from "../lib/bridge";
import { t } from "../lib/strings";
import { Button } from "./ui/button";

/** The app's settings (decisions: skills and connectors are added from the settings). */
export function SettingsDialog({
  project,
  skills,
  onClose,
}: {
  project: ProjectInfo | null;
  skills: SkillInfo[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      data-testid="settings"
      className="absolute inset-0 z-20 flex items-start justify-center overflow-y-auto bg-background/80 p-8 backdrop-blur-sm"
    >
      <div className="w-full max-w-2xl rounded-xl border bg-background shadow-lg">
        <div className="flex items-center gap-3 border-b px-6 py-4">
          <h2 className="flex-1 text-lg font-semibold">{t.settings.title}</h2>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            title={t.settings.close}
            data-testid="settings-close"
          >
            <X />
          </Button>
        </div>
        <div className="flex flex-col gap-6 px-6 py-5">
          <section className="flex flex-col gap-2">
            <h3 className="text-base font-medium">{t.skills.title}</h3>
            <p className="text-sm text-muted-foreground">{t.skills.intro}</p>
          </section>
          <SkillGroup
            origin="project"
            title={project ? t.skills.project(project.name) : t.skills.projectNone}
            skills={skills.filter((s) => s.origin === "project")}
            disabled={!project}
          />
          <SkillGroup origin="app" title={t.skills.app} skills={skills.filter((s) => s.origin === "app")} />
          <SkillGroup origin="upstart" title={t.skills.upstart} skills={skills.filter((s) => s.origin === "upstart")} />
        </div>
      </div>
    </div>
  );
}

function SkillGroup({
  origin,
  title,
  skills,
  disabled,
}: {
  origin: SkillInfo["origin"];
  title: string;
  skills: SkillInfo[];
  disabled?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const editable = origin !== "upstart";
  const add = async () => {
    if (origin === "upstart") return;
    setError(null);
    const folder = await upstart.invoke("skills:choose-folder");
    if (!folder) return;
    try {
      await upstart.invoke("skills:add", origin, folder);
    } catch (e) {
      setError(messageOf(e));
    }
  };
  return (
    <section className="flex flex-col gap-2" data-testid={`skills-${origin}`}>
      <div className="flex items-center gap-2">
        <h4 className="flex-1 text-sm font-medium">{title}</h4>
        {editable && (
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            disabled={disabled}
            onClick={() => void add()}
            data-testid={`skills-add-${origin}`}
          >
            <Plus />
            {t.skills.add}
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {skills.length === 0 ? (
        <p className="text-sm text-muted-foreground">{editable && !disabled ? t.skills.noneYet : t.skills.none}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {skills.map((skill) => (
            <li key={skill.name} data-testid="skill" className="group flex items-start gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-sm">{skill.name}</div>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{skill.description}</p>
              </div>
              {origin !== "upstart" && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  title={t.skills.remove}
                  onClick={() => void upstart.invoke("skills:remove", origin, skill.name)}
                  data-testid="skill-remove"
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** What the main process said, without Electron's "Error invoking remote method" prefix. */
export function messageOf(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e);
  return text.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}
