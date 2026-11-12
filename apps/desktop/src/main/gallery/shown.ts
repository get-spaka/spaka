// A gallery block as its thumbnail and its peek show it (Q109): a data block
// rendered with its own sample records (Q205), whatever the open project
// holds; any other block as it is written.
import { memorySource, Runtime } from "@upstart/runtime";
import { isCollected } from "../editing/data-drop";
import type { Block } from "./catalogue";

const shown = new WeakMap<Block, string>();

export function blockShown(block: Block): string {
  if (!block.data || !block.datasource) return block.source;
  const kept = shown.get(block);
  if (kept !== undefined) return kept;
  const { name } = block.data;
  const files: Record<string, string> = {
    "pages/index.liquid": `<!doctype html><html><head><title></title></head><body>{% render '${block.id}' %}</body></html>`,
    [`parts/${block.id}.liquid`]: block.source,
    [`data/${name}/_datasource.yaml`]: block.datasource.definition,
  };
  const tests: Record<string, string> = {};
  // A form's samples are test records, as the preview shows them (Q182).
  const collected = isCollected(block.datasource.definition);
  for (const [file, text] of Object.entries(block.datasource.records)) {
    if (collected) tests[`${name}/${file}`] = text;
    else files[`data/${name}/${file}`] = text;
  }
  const html = new Runtime(memorySource(files), { testRecords: memorySource(tests) }).renderRoute("/").html;
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1]?.trim() ?? block.source;
  shown.set(block, body);
  return body;
}
