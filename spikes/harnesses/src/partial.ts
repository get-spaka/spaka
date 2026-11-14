// A file-writing tool call's arguments while they stream in as JSON text: the
// path and as much of the content as has arrived, unescaped.

export function partialWrite(json: string): { path?: string; content?: string } {
  const path = /"(?:path|file_path|filePath)"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(json)?.[1];
  const start = /"(?:content|text)"\s*:\s*"/.exec(json);
  let content: string | undefined;
  if (start) {
    let raw = json.slice(start.index + start[0].length);
    // Up to the closing quote, if it has come.
    const end = /(?<!\\)(?:\\\\)*"/.exec(raw);
    if (end) raw = raw.slice(0, end.index + end[0].length - 1);
    // An escape cut in the middle is left for the next delta.
    raw = raw.replace(/\\u[0-9a-fA-F]{0,3}$|\\$/, "");
    try {
      content = JSON.parse(`"${raw}"`);
    } catch {
      content = raw;
    }
  }
  return { path: path === undefined ? undefined : JSON.parse(`"${path}"`), content };
}
