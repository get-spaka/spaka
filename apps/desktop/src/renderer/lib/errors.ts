/** What the main process said, without Electron's "Error invoking remote method" prefix. */
export function messageOf(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e);
  return text.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}
