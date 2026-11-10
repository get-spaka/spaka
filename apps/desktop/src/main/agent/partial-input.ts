// Reads the input of a tool call while it is still streaming.
//
// With includePartialMessages the SDK forwards `input_json_delta` events whose
// `partial_json` pieces add up to the tool input, e.g. for Write:
//   {"file_path": "/abs/pages/index.liquid", "content": "<!doctype html>\n<html…
// This extracts the string fields received so far, decoding JSON escapes and
// holding back anything half-received (a lone backslash, part of \uXXXX, the
// first half of a surrogate pair).

export type PartialInput = {
  /** String fields seen so far, decoded. A field still streaming holds its prefix. */
  fields: Record<string, string>;
  /** True for a field whose closing quote has arrived. */
  done: Record<string, boolean>;
};

export function parsePartialInput(json: string): PartialInput {
  const fields: Record<string, string> = {};
  const done: Record<string, boolean> = {};
  let i = 0;
  const n = json.length;
  const ws = () => {
    while (i < n && /\s/.test(json[i]!)) i++;
  };
  /** Reads a JSON string starting at the opening quote. Returns [decoded, closed]. */
  const readString = (): [string, boolean] => {
    i++; // opening quote
    let out = "";
    while (i < n) {
      const c = json[i];
      if (c === '"') {
        i++;
        return [out, true];
      }
      if (c === "\\") {
        const e = json[i + 1];
        if (e === undefined) return [out, false];
        if (e === "u") {
          const hex = json.slice(i + 2, i + 6);
          if (hex.length < 4) return [out, false];
          const code = parseInt(hex, 16);
          if (code >= 0xd800 && code <= 0xdbff) {
            // High surrogate: wait for its other half.
            const next = json.slice(i + 6, i + 12);
            if (next.length < 6) return [out, false];
            if (/^\\u[dD][c-fC-F][0-9a-fA-F]{2}$/.test(next)) {
              out += String.fromCharCode(code, parseInt(next.slice(2), 16));
              i += 12;
              continue;
            }
          }
          out += String.fromCharCode(code);
          i += 6;
          continue;
        }
        out += e === "n" ? "\n" : e === "t" ? "\t" : e === "r" ? "\r" : e === "b" ? "\b" : e === "f" ? "\f" : e;
        i += 2;
        continue;
      }
      out += c;
      i++;
    }
    return [out, false];
  };

  ws();
  if (json[i] !== "{") return { fields, done };
  i++;
  while (i < n) {
    ws();
    if (json[i] === ",") {
      i++;
      continue;
    }
    if (json[i] !== '"') break; // "}" or something not yet received
    const [key, keyClosed] = readString();
    if (!keyClosed) break;
    ws();
    if (json[i] !== ":") break;
    i++;
    ws();
    if (i >= n) break;
    if (json[i] === '"') {
      const [value, closed] = readString();
      fields[key] = value;
      done[key] = closed;
      if (!closed) break;
    } else {
      // A number, boolean or null (e.g. replace_all): skip it.
      const m = /^[^,}\s]+/.exec(json.slice(i, i + 40));
      if (!m) break;
      i += m[0].length;
    }
  }
  return { fields, done };
}
