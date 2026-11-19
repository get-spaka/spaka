// Writing a file whole: written beside it, then moved over it in one step, so
// that a reader never sees half of it. On Windows the move fails for a moment
// while another program holds the file (an antivirus scanning it, a watcher,
// the search indexer): it is tried again a few times before giving up.
import { renameSync } from "node:fs";

const BUSY = new Set(["EPERM", "EBUSY", "EACCES"]);

/** Moves `from` over `to`, trying again for about a second while Windows holds the file. */
export function replaceFile(from: string, to: string, tries = 10, platform = process.platform): void {
  for (let i = 1; ; i++) {
    try {
      renameSync(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (platform !== "win32" || !code || !BUSY.has(code) || i >= tries) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20 * i);
    }
  }
}
