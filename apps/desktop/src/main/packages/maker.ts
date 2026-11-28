// What the maker sees of a website's packages: the card of a package in the
// grey zone (Q536), the notices after package.json changed by hand (Q540)
// and those of a known flaw, with their button (Q538), and the export's
// warnings (Q521).
import semver from "semver";
import type { AgentQuestion, NoticeAction, QuestionAnswer } from "../../shared/conversation";
import { en } from "../../shared/strings/en";
import type { FoundFlaw, GreyPackage, MakerAnswer, Refused, SyncReport } from "./packages";
import type { Doubt } from "./rules";

const t = en.packages;

export function doubtText(doubt: Doubt): string {
  if (doubt.kind === "young") return t.doubts.young(doubt.days);
  if (doubt.kind === "few-downloads") return t.doubts.fewDownloads(doubt.downloads);
  if (doubt.kind === "similar") return t.doubts.similar(doubt.to);
  return t.doubts.noRepository;
}

/** The card asked before a package in the grey zone is installed: no choice recommended. */
export function greyCard(grey: GreyPackage): AgentQuestion {
  return {
    question: t.question(grey.name, grey.version, grey.description, grey.doubts.map(doubtText)),
    header: t.header,
    options: [
      { label: t.install, description: t.installHint },
      { label: t.dontInstall, description: t.dontInstallHint },
    ],
    multiSelect: false,
  };
}

/** The maker's answer to the card: their own words, or skipping it, do not install. */
export function greyAnswer(card: AgentQuestion, got: { answer: QuestionAnswer } | undefined): MakerAnswer {
  if (!got) return undefined;
  const { answer } = got;
  if (answer.kind === "choices") {
    const chosen = answer.answers[card.question];
    if (chosen === t.install) return { install: true };
    if (chosen === t.dontInstall || chosen === undefined) return { install: false };
    return { install: false, words: Array.isArray(chosen) ? chosen.join(", ") : chosen };
  }
  if (answer.kind === "words") return { install: false, words: answer.text };
  return { install: false };
}

function refusedText(why: Refused): string {
  if (why.kind === "elsewhere") return t.elsewhere;
  if (why.kind === "problem") return why.text.replace(/\.$/, "");
  return why.refusals
    .map((r) => (r.kind === "flaw" ? t.flawWhy(r.flaw.id, r.flaw.summary, r.flaw.fixed) : t.compilesWhy))
    .join("; ");
}

/** The notices after package.json changed by hand: what was installed, taken out, or why nothing was. */
export function syncNotices(report: SyncReport): string[] {
  return [
    ...report.refused.map((r) => t.refused(r.name, refusedText(r.why))),
    ...(report.failed ? [t.failed(report.failed)] : []),
    ...report.installed.map((p) =>
      p.doubts.length ? t.installedDespite(p.name, p.version, p.doubts.map(doubtText)) : t.installed(p.name, p.version),
    ),
    ...(report.removed.length && !report.failed ? [t.removed(report.removed)] : []),
  ];
}

/**
 * The notices of known flaws, one for each version that has some, and the
 * button asking the agent for the update: of the package, or of the
 * website's package that brings it (Q538).
 */
export function flawNotices(found: FoundFlaw[]): { text: string; action: NoticeAction }[] {
  const byVersion = new Map<string, FoundFlaw[]>();
  for (const f of found)
    byVersion.set(`${f.name}@${f.version}`, [...(byVersion.get(`${f.name}@${f.version}`) ?? []), f]);
  return [...byVersion.values()].map((flaws) => {
    const { name, version, via } = flaws[0]!;
    const direct = via.includes(name) ? name : (via[0] ?? name);
    // The version that fixes them all, if each is fixed.
    const fixes = flaws.map((f) => f.flaw.fixed);
    const fixed = fixes.every(Boolean) ? (fixes as string[]).sort(semver.rcompare)[0] : undefined;
    const list = flaws.map((f) => ({ id: f.flaw.id, summary: f.flaw.summary }));
    return {
      text: t.flaw(name, version, list, fixed, direct === name ? undefined : direct),
      action: {
        label: t.askUpdate,
        tip: t.askUpdateTip,
        message: t.updateMessage(
          direct,
          name,
          list.map((f) => f.id),
          fixed,
        ),
      },
    };
  });
}

/** The export's warnings for the known flaws of the installed versions. */
export function exportWarnings(flaws: FoundFlaw[]): string[] {
  return flaws.map((f) => t.exportFlaw(f.name, f.version, f.flaw.summary, f.flaw.id, f.flaw.fixed));
}
