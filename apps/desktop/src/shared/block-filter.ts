// Filtering the Blocks tab as the maker types (it is not the agent's ranked
// search): each word typed must begin a word of what the block says of
// itself, in English or French, accents and case aside.
import type { GalleryBlock } from "./ipc";

/** The words of a text, lower case and without accents. */
export const foldWords = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** Whether a block answers the words typed; `also` holds other names for it, such as its kind's label. */
export function matchesBlock(block: GalleryBlock, query: string, also: string[] = []): boolean {
  const wanted = foldWords(query);
  if (!wanted.length) return true;
  const own = foldWords(
    [block.kind, block.name, block.description, ...block.tags, ...block.synonyms, ...block.mood, ...also].join(" "),
  );
  return wanted.every((w) => own.some((o) => o.startsWith(w)));
}
