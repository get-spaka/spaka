// A name like a well-known package's (Q500): one letter off, two swapped, or
// the same name with its dashes, dots or scope moved, as typosquats are.
import list from "./well-known.json";

const WELL_KNOWN: readonly string[] = list.names;
const KNOWN = new Set(WELL_KNOWN);
/** Shorter names differ from many others by one letter, by chance. */
const SHORTEST = 5;

const flat = (name: string) => name.replace(/[-_.@/]/g, "");
/** Each name without its separators, the most downloaded first. */
const FLAT = new Map<string, string>();
for (const name of WELL_KNOWN) if (!FLAT.has(flat(name))) FLAT.set(flat(name), name);

/** Whether two different names are one edit apart: a letter added, dropped or changed, or two next to each other swapped. */
export function oneEditApart(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const rest = (x: string, from: number) => x.slice(from);
  if (a.length === b.length)
    return (
      rest(a, i + 1) === rest(b, i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && rest(a, i + 2) === rest(b, i + 2))
    );
  return a.length > b.length ? rest(a, i + 1) === rest(b, i) : rest(a, i) === rest(b, i + 1);
}

/** The well-known package a name looks like, unless it is one itself. */
export function similarName(name: string): string | undefined {
  if (KNOWN.has(name)) return undefined;
  const same = FLAT.get(flat(name));
  if (same) return same;
  if (name.length < SHORTEST) return undefined;
  return WELL_KNOWN.find((known) => known.length >= SHORTEST && oneEditApart(name, known));
}
