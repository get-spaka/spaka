// Finding blocks in the gallery for the agent (Q97, Q98): a lexical search,
// BM25 over what each block says of itself, its words weighted by where they
// are (a kind, a name or a tag count more than a word of the description).
// French and English words alike, accents and plurals folded.
import type { Block } from "./catalogue";

const FIELDS = { kind: 3, name: 2, tags: 2, synonyms: 2, mood: 1.5, description: 1 } as const;
const K1 = 1.2;
const B = 0.75;

/** Words for matching: lower case, no accents, plurals and a few endings folded. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
}

function stem(word: string): string {
  if (word.length <= 3) return word;
  if (/(ies)$/.test(word)) return `${word.slice(0, -3)}y`;
  if (/(ses|xes|ches|shes)$/.test(word)) return word.slice(0, -2);
  if (/[^s]s$/.test(word) || /[^aeiou]x$/.test(word)) return word.slice(0, -1);
  return word;
}

const STOP = new Set(
  "the and for with of to in on an or by at is it its that this le la les un une des du de et ou en au aux pour avec sur dans".split(
    " ",
  ),
);

type Indexed = { block: Block; terms: Map<string, number>; length: number };

export class BlockIndex {
  private readonly docs: Indexed[];
  private readonly df = new Map<string, number>();
  private readonly avgLength: number;

  constructor(blocks: Block[]) {
    this.docs = blocks.map((block) => {
      const terms = new Map<string, number>();
      let length = 0;
      const add = (text: string, weight: number) => {
        for (const w of words(text)) {
          terms.set(w, (terms.get(w) ?? 0) + weight);
          length += weight;
        }
      };
      add(block.kind, FIELDS.kind);
      add(block.name, FIELDS.name);
      add(block.tags.join(" "), FIELDS.tags);
      add(block.synonyms.join(" "), FIELDS.synonyms);
      add(block.mood.join(" "), FIELDS.mood);
      add(block.description, FIELDS.description);
      for (const term of terms.keys()) this.df.set(term, (this.df.get(term) ?? 0) + 1);
      return { block, terms, length };
    });
    this.avgLength = this.docs.reduce((n, d) => n + d.length, 0) / Math.max(1, this.docs.length);
  }

  /**
   * The best blocks for a query, of one kind if given. With an empty query, the
   * blocks of that kind in the gallery's order. Blocks matching no word are left out.
   */
  find(query: string, { kind, limit = 4 }: { kind?: string; limit?: number } = {}): Block[] {
    const pool = this.docs.filter((d) => !kind || d.block.kind === kind);
    const asked = [...new Set(words(query))];
    if (!asked.length) return pool.slice(0, limit).map((d) => d.block);
    const n = this.docs.length;
    const scored = pool
      .map((d) => {
        let score = 0;
        for (const term of asked) {
          const tf = d.terms.get(term);
          if (!tf) continue;
          const df = this.df.get(term) ?? 0;
          const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
          score += (idf * tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * d.length) / this.avgLength));
        }
        return { d, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.d.block);
  }
}
