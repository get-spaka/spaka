// What Spaka tells the agent while it works, whichever agent it is (ADR
// 0012): after a tool call, that a datasource file it wrote does not read
// (Q170); before it stops, the sample records, lorem ipsum and template texts
// it left behind (Q217, Q218, Q223, Q246) and the pages taken off the website (Q307), once.
import { loremLeft, loremLeftNote, nameRecords, samplesLeftNote, unchangedSamples } from "../editing/use-blocks";
import {
  forgetTemplateTexts,
  removalsLeftNote,
  removalsOf,
  templateLeftNote,
  templateTextsLeft,
} from "../templates/adapt";
import { adaptationScope, readAdaptation } from "../templates/adaptation";
import { dataProblemsAfter } from "./data-check";

export class TurnChecks {
  /** The sample records use_block wrote in this turn, named to the agent once if it leaves them (Q217). */
  private readonly placedSamples = new Set<string>();
  /** The parts and record pages it wrote, their lorem ipsum named to the agent once if left (Q223). */
  private readonly placedFiles = new Set<string>();
  /** Whether it was told of the template's texts left in this turn (Q246). */
  private templateTold = false;

  constructor(private readonly root: string) {}

  /** What use_block wrote. */
  placed(samples: Iterable<string>, files: Iterable<string>) {
    for (const path of samples) this.placedSamples.add(path);
    for (const path of files) this.placedFiles.add(path);
  }

  /** After a tool call (canonical name and input): a note for the agent, with the tool's answer. */
  afterTool(tool: string, input: unknown): string | undefined {
    if (tool !== "Write" && tool !== "Edit" && tool !== "Append" && tool !== "Bash") return undefined;
    return dataProblemsAfter(this.root, tool, input);
  }

  /**
   * The agent is about to stop: what sends it back to work, if anything.
   * `again`: it was already sent back once in this turn, and may now stop.
   */
  beforeStop(again: boolean): string | undefined {
    // The samples it rewrote, named after their titles (Q218).
    nameRecords(this.root);
    const left = again ? [] : unchangedSamples(this.root).filter((path) => this.placedSamples.has(path));
    const lorem = again ? [] : loremLeft(this.root, this.placedFiles);
    this.placedSamples.clear();
    this.placedFiles.clear();
    // The template's texts, named once; those it keeps after that are kept on
    // purpose (Q246). During an adaptation, only in what is adapted (Q305).
    const fromTemplate = templateTextsLeft(this.root, adaptationScope(this.root));
    const tellTemplate = !again && fromTemplate.length > 0;
    if (!tellTemplate) forgetTemplateTexts(this.root, this.templateTold ? fromTemplate.flatMap((l) => l.texts) : []);
    this.templateTold = tellTemplate;
    // The page types the maker took off the website, still there (Q307).
    const adaptation = again ? undefined : readAdaptation(this.root);
    const removals = adaptation?.chosen ? removalsOf(this.root, adaptation) : [];
    const notes = [
      ...(left.length ? [samplesLeftNote(left)] : []),
      ...(lorem.length ? [loremLeftNote(lorem)] : []),
      ...(tellTemplate ? [templateLeftNote(fromTemplate)] : []),
      ...(removals.length ? [removalsLeftNote(removals)] : []),
    ];
    return notes.length ? notes.join("\n\n") : undefined;
  }
}
