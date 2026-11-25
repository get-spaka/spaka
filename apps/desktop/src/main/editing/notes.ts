// What the agent is told before the maker's next message: that the project
// went back to an earlier version, or what the maker changed by hand (Q90),
// so it reads a file again before editing it.

export class AgentNotes {
  private wentBack: string | undefined;
  private changes: { label: string; files: string[] }[] = [];

  /** The project went back to the version after `label`; what was changed by hand before that is gone. */
  restored(label: string) {
    this.wentBack = label;
    this.changes = [];
  }

  changed(change: { label: string; files: string[] }) {
    this.changes.push(change);
  }

  /** The note to put before the message, once; undefined when there is nothing to say. */
  take(): string | undefined {
    const parts: string[] = [];
    if (this.wentBack !== undefined)
      parts.push(`the maker took the project back to an earlier version (the one after "${this.wentBack}")`);
    if (this.changes.length) {
      const list = this.changes.map((c) => `${c.label.toLowerCase()} (${c.files.join(", ")})`).join("; ");
      parts.push(`since then the maker changed by hand: ${list}`);
    }
    this.wentBack = undefined;
    this.changes = [];
    if (!parts.length) return undefined;
    const text = parts.join("; ").replace(/^since then/, "since your last turn");
    return `[Spaka: ${text}. The files may differ from what you remember: read a file again before editing it.]`;
  }
}
