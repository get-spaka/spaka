// Applies the maker's own edits to the open project (decisions, Q90, Q91,
// Q94): checks that the agent is not working, writes the file, takes a
// snapshot for each action, and keeps a note of it for the agent's next
// message. The text changes themselves are in edits.ts.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import {
  Datasources,
  DEFINITION_FILE,
  infoFile,
  locate,
  newRecordText,
  RecordWriteRefused,
  readRecordFile,
  recordFile,
  recordIdFrom,
  recordOf,
  recordTitle,
  renameInOrder,
  sections,
  setOrder,
  setRecordValue,
  validRecordId,
} from "@upstart/runtime";
import { diskSource } from "@upstart/runtime/node";
import type { EditAction, EditInfo } from "../../shared/ipc";
import { copyOfPage } from "../../shared/page-grid";
import { en } from "../../shared/strings/en";
import { addFile, addImage, replaceUses, slug, usesLabel, usesOf, usingFiles } from "../media/library";
import type { ImageFinder } from "../media/search";
import {
  copyName,
  duplicateRange,
  EditRefused,
  editText,
  includeAt,
  insertBefore,
  moveSection,
  pagesUsing,
  placeFor,
  removeRange,
  renameInclude,
  setLink,
  targetAt,
} from "./edits";

/** The index of the section starting at `at` among a page's sections; their count for null. */
function sectionIndex(src: string, at: number | null): number {
  const list = sections(src);
  if (at === null) return list.length;
  const index = list.findIndex((s) => s.outer.start === at);
  if (index < 0) throw new EditRefused("This section has moved since it was shown.");
  return index;
}

/**
 * A file the maker may edit: a page, a shared part or a fragment; a record of
 * a datasource, or its definition's order; what is kept beside a media file.
 */
const EDITABLE =
  /^((pages|parts|fragments)\/[\w./[\]-]+\.liquid|data\/[a-z0-9][\w-]*\/([a-z0-9][\w-]*\.md|_datasource\.yaml)|media\/[\w.-]+\.json)$/i;
/** A record's file. */
const RECORD = /^data\/[a-z0-9][\w-]*\/[a-z0-9][\w-]*\.md$/i;

export type EditorDeps = {
  /** The open project's folder. */
  root: () => string | undefined;
  /** Whether the agent is in the middle of a turn: editing waits (Q91). */
  busy: () => boolean;
  /** Called before anything is written: what changed outside the app gets its own snapshot first. */
  before: () => void;
  /** Called once a change is on the disk, with what it was, for the history and the agent. */
  changed: (change: { label: string; files: string[] }) => void;
  /** A gallery block's kind and template (Q92). */
  block: (id: string) => { kind: string; source: string } | undefined;
};

export class Editor {
  /**
   * The record the Content tab is writing: each change is on the disk at
   * once, and makes one version only when the maker leaves the record (Q162).
   */
  private editing?: { file: string; added: boolean; label?: string };

  constructor(private readonly deps: EditorDeps) {}

  /** Writes one value of a record, a field or its text below, without a version (Q162). */
  setRecordValue(file: string, field: string, value: unknown, isBody: boolean): void {
    if (this.deps.busy()) throw new EditRefused(en.editing.busy);
    if (!RECORD.test(file)) throw new EditRefused("Only a record's values can be changed here.");
    const src = this.read(file);
    if (this.editing?.file !== file) {
      this.leaveRecord();
      this.deps.before();
      this.editing = { file, added: false };
    }
    try {
      this.write(file, setRecordValue(src, field, value, isBody));
    } catch (error) {
      if (error instanceof RecordWriteRefused) throw new EditRefused(error.message);
      throw error;
    }
  }

  /**
   * A new record, written once the maker has typed in its form, its id made
   * from its title (Q165); its version comes when the maker leaves it.
   */
  addRecord(datasource: string, values: Record<string, unknown>, body = ""): { file: string; id: string } {
    this.ready();
    const definition = this.datasources().definition(datasource).definition;
    if (!definition) throw new EditRefused("This datasource has no definition yet.");
    const title = recordTitle({ id: "", __ref: "", ...values }, definition);
    const id = recordIdFrom(title, (id) => existsSync(this.abs(recordFile(datasource, id))));
    const file = recordFile(datasource, id);
    // The fields in the definition's order.
    const ordered = Object.fromEntries(
      [...definition.fields.map((f) => f.name), ...Object.keys(values)]
        .filter((name, i, all) => all.indexOf(name) === i && name in values && name !== definition.body)
        .map((name) => [name, values[name]]),
    );
    const text = newRecordText(ordered, definition.body ? String(values[definition.body] ?? body) : body);
    this.write(file, text);
    this.editing = { file, added: true };
    return { file, id };
  }

  /** The maker left the record they were writing: one version, told to the agent (Q162). */
  leaveRecord(): { label: string; files: string[] } | undefined {
    const editing = this.editing;
    this.editing = undefined;
    if (!editing) return undefined;
    const t = en.editing.labels;
    const name = editing.label ? "" : this.recordName(editing.file);
    const label = editing.label ?? (editing.added ? t.recordAdded(name) : t.recordEdited(name));
    const change = { label, files: [editing.file] };
    this.deps.changed(change);
    return change;
  }

  /** The manual order of a datasource's records, written in its definition (Q153). */
  reorderRecords(datasource: string, ids: string[]): { label: string; files: string[] } {
    this.ready();
    const file = `data/${datasource}/${DEFINITION_FILE}`;
    try {
      this.write(file, setOrder(this.read(file), ids));
    } catch (error) {
      if (error instanceof RecordWriteRefused) throw new EditRefused(error.message);
      throw error;
    }
    const change = { label: en.editing.labels.recordsReordered, files: [file] };
    this.deps.changed(change);
    return change;
  }

  /** A record's id changed: its file renamed, and its place in the manual order kept (Q165). */
  renameRecord(file: string, id: string): { label: string; files: string[]; file: string } {
    this.ready();
    const from = recordOf(file);
    if (!from || !RECORD.test(file)) throw new EditRefused("Only a record can be renamed.");
    if (!validRecordId(id)) throw new EditRefused(en.editing.recordIdInvalid);
    const to = recordFile(from.datasource, id);
    if (to === file) return { label: en.editing.labels.recordRenamed, files: [], file };
    if (existsSync(this.abs(to))) throw new EditRefused(en.editing.recordIdTaken);
    const text = this.read(file);
    this.write(to, text);
    rmSync(this.abs(file));
    const files = [file, to];
    const definitionFile = `data/${from.datasource}/${DEFINITION_FILE}`;
    const definition = existsSync(this.abs(definitionFile)) ? this.read(definitionFile) : undefined;
    const renamed = definition && renameInOrder(definition, from.id, id);
    if (definition && renamed !== definition) {
      this.write(definitionFile, renamed!);
      files.push(definitionFile);
    }
    const change = { label: en.editing.labels.recordRenamed, files };
    this.deps.changed(change);
    return { ...change, file: to };
  }

  /** Files dropped or chosen from the disk, added to media/ (Q158, Q169): one version. */
  async addMedia(paths: string[]): Promise<{ label: string; files: string[]; paths: string[] }> {
    this.ready();
    const root = this.root();
    const added: string[] = [];
    try {
      for (const path of paths) added.push((await addFile(root, path)).path);
    } finally {
      if (added.length) this.deps.changed({ label: en.editing.labels.mediaAdded(added.length), files: added });
    }
    return { label: en.editing.labels.mediaAdded(added.length), files: added, paths: added };
  }

  /** An image found by the maker's search, added with its credits (Q150). */
  async addFoundImage(finder: ImageFinder, id: string, alt: string): Promise<{ path: string }> {
    this.ready();
    const image = finder.found(id);
    if (!image) throw new EditRefused("This image is no longer in the search's results: search again.");
    const bytes = await finder.download(image);
    const added = await addImage(this.root(), image.title, bytes, { alt, credit: image.credit });
    this.deps.changed({ label: en.editing.labels.imageAdded, files: [added.path, infoFile(added.path)] });
    return { path: added.path };
  }

  /** A media file's alt text, written at once; one version when the maker moves on, as a record's values (Q162). */
  setMediaAlt(path: string, alt: string): void {
    if (this.deps.busy()) throw new EditRefused(en.editing.busy);
    this.media(path);
    const file = infoFile(path);
    if (this.editing?.file !== file) {
      this.leaveRecord();
      this.deps.before();
      this.editing = { file, added: false, label: en.editing.labels.altChanged(basename(path)) };
    }
    let info: Record<string, unknown> = {};
    try {
      info = existsSync(this.abs(file)) ? JSON.parse(this.read(file)) : {};
    } catch {}
    const next = { ...info, alt: alt.trim() ? alt : undefined };
    this.write(file, `${JSON.stringify(next, null, 2)}\n`);
  }

  /** A media file deleted, with the file beside it; refused while a page or a record uses it (Q168). */
  deleteMedia(path: string, labelOf?: (datasource: string) => string): { label: string; files: string[] } {
    this.ready();
    const abs = this.media(path);
    const uses = usesOf(path, usingFiles(this.root()));
    if (uses.length) throw new EditRefused(en.editing.mediaInUse(usesLabel(uses, labelOf)));
    rmSync(abs);
    const files = [path];
    const info = join(this.root(), infoFile(path));
    if (existsSync(info)) {
      rmSync(info);
      files.push(infoFile(path));
    }
    const change = { label: en.editing.labels.mediaDeleted, files };
    this.deps.changed(change);
    return change;
  }

  /** A media file renamed, and every page, part and record that uses it updated: one version (Q168). */
  renameMedia(path: string, name: string): { label: string; files: string[]; path: string } {
    this.ready();
    const abs = this.media(path);
    const root = this.root();
    const ext = extname(path);
    const to = `media/${slug(name)}${ext}`;
    if (to === path) return { label: en.editing.labels.mediaRenamed, files: [], path };
    if (existsSync(join(root, to)) || existsSync(join(root, infoFile(to))))
      throw new EditRefused(en.editing.mediaNameTaken);
    renameSync(abs, join(root, to));
    const files = [path, to];
    if (existsSync(join(root, infoFile(path)))) {
      renameSync(join(root, infoFile(path)), join(root, infoFile(to)));
      files.push(infoFile(path), infoFile(to));
    }
    for (const [file, text] of Object.entries(replaceUses(path, to, usingFiles(root)))) {
      atomicWrite(join(root, file), text);
      files.push(file);
    }
    const change = { label: en.editing.labels.mediaRenamed, files };
    this.deps.changed(change);
    return { ...change, path: to };
  }

  private root(): string {
    const root = this.deps.root();
    if (!root) throw new EditRefused("No project is open.");
    return root;
  }

  /** A file of the media library, by its path in the project. */
  private media(path: string): string {
    if (!/^media\/[\w][\w.-]*$/.test(path) || path.endsWith(".json") || path.includes(".."))
      throw new EditRefused("This is not a file of the media library.");
    const abs = join(this.root(), path);
    if (!existsSync(abs)) throw new EditRefused("This file has changed since it was shown.");
    return abs;
  }

  /** A record's title, or its id. */
  private recordName(file: string): string {
    const of = recordOf(file);
    if (!of) return file;
    const definition = this.datasources().definition(of.datasource).definition;
    let values: Record<string, unknown> = {};
    try {
      values = readRecordFile(this.read(file)).values;
    } catch {}
    return recordTitle({ ...values, id: of.id, __ref: "" }, definition);
  }

  private datasources(): Datasources {
    const root = this.deps.root();
    if (!root) throw new EditRefused("No project is open.");
    return new Datasources(diskSource(root));
  }

  apply(action: EditAction): { label: string; files: string[] } {
    this.ready();
    const t = en.editing.labels;
    const src = this.read(action.file);
    const writes: Record<string, string> = {};
    let label: string;
    switch (action.type) {
      case "text":
        writes[action.file] = editText(src, action.at, action.texts, action.tags);
        label = t.text;
        break;
      case "link":
        writes[action.file] = setLink(src, action.at, action.href);
        label = t.link;
        break;
      case "delete":
        writes[action.file] = removeRange(src, targetAt(src, action.at).range);
        label = t.deleted;
        break;
      case "duplicate": {
        const target = targetAt(src, action.at);
        if (target.include) {
          // A shared part's copy is a part of its own (Q103).
          const name = copyName(target.include, (n) => existsSync(this.abs(`parts/${n}.liquid`)));
          writes[`parts/${name}.liquid`] = this.read(`parts/${target.include}.liquid`);
          const tag = src.slice(target.range.start, target.range.end);
          writes[action.file] = duplicateRange(src, target.range, renameInclude(tag, name));
        } else writes[action.file] = duplicateRange(src, target.range);
        label = t.duplicated;
        break;
      }
      case "move":
        writes[action.file] = moveSection(src, sectionIndex(src, action.at), sectionIndex(src, action.before));
        label = t.moved;
        break;
      case "insert": {
        // A gallery block becomes a shared part of its own, included where it was dropped (Q101).
        const block = this.deps.block(action.block);
        if (!block) throw new EditRefused("This block is not in the gallery.");
        const taken = (n: string) => existsSync(this.abs(`parts/${n}.liquid`));
        const name = taken(action.block) ? copyName(action.block, taken) : action.block;
        // A second copy names its ids and radio groups after itself, so that two on one page stay apart.
        const source = name === action.block ? block.source : block.source.replaceAll(action.block, name);
        writes[`parts/${name}.liquid`] = source.endsWith("\n") ? source : `${source}\n`;
        const index = action.before === "auto" ? placeFor(src, block.kind) : sectionIndex(src, action.before);
        writes[action.file] = insertBefore(src, index, `{% render '${name}' %}`);
        label = t.inserted;
        break;
      }
    }
    for (const [file, content] of Object.entries(writes)) this.write(file, content);
    const change = { label, files: Object.keys(writes) };
    this.deps.changed(change);
    return change;
  }

  /**
   * Copies a page beside it, at the next free address (/menu-2): nothing links
   * to the copy yet (Q138). One version, told to the agent like any edit by hand.
   */
  duplicatePage(file: string): { label: string; files: string[]; file: string } {
    this.ready();
    const src = this.read(file);
    if (!file.startsWith("pages/")) throw new EditRefused("Only a page can be duplicated.");
    const copy = copyOfPage(file, Object.keys(this.templates()));
    this.write(copy, src);
    const change = { label: en.editing.labels.pageDuplicated, files: [copy] };
    this.deps.changed(change);
    return { ...change, file: copy };
  }

  /** Deletes a page's file, which the history can bring back (Q137); the home page is kept. */
  deletePage(file: string, home: boolean): { label: string; files: string[] } {
    if (home) throw new EditRefused(en.editing.homeKept);
    this.ready();
    if (!file.startsWith("pages/")) throw new EditRefused("Only a page can be deleted.");
    this.read(file);
    rmSync(this.abs(file));
    const change = { label: en.editing.labels.pageDeleted, files: [file] };
    this.deps.changed(change);
    return change;
  }

  /** Copies a record beside it, at the next free id (hello-2), from the Content tab or its page's menu (Q164). */
  duplicateRecord(file: string): { label: string; files: string[]; file: string } {
    this.ready();
    if (!RECORD.test(file)) throw new EditRefused("Only a record can be duplicated here.");
    const src = this.read(file);
    const dir = dirname(this.abs(file));
    const taken = readdirSync(dir).map((name) => `${file.slice(0, file.lastIndexOf("/"))}/${name}`);
    const copy = copyOfPage(file, taken);
    this.write(copy, src);
    const change = { label: en.editing.labels.recordDuplicated, files: [copy] };
    this.deps.changed(change);
    return { ...change, file: copy };
  }

  /** Deletes a record's file, which the history can bring back (Q164, Q137). */
  deleteRecord(file: string): { label: string; files: string[] } {
    this.ready();
    if (!RECORD.test(file)) throw new EditRefused("Only a record can be deleted here.");
    this.read(file);
    rmSync(this.abs(file));
    const change = { label: en.editing.labels.recordDeleted, files: [file] };
    this.deps.changed(change);
    return change;
  }

  /** Editing waits for the agent's turn to end (Q91); what changed outside the app gets its own version first. */
  private ready() {
    if (this.deps.busy()) throw new EditRefused(en.editing.busy);
    // A record being written gets its version first.
    this.leaveRecord();
    this.deps.before();
  }

  /**
   * Writes theme.css as the Theme tab set it (Q93), and any font files it now
   * uses: one version, told to the agent like any edit by hand.
   */
  writeTheme(css: string, fonts: Record<string, Buffer> = {}): { label: string; files: string[] } {
    if (this.deps.busy()) throw new EditRefused(en.editing.busy);
    const root = this.deps.root();
    if (!root) throw new EditRefused("No project is open.");
    this.leaveRecord();
    this.deps.before();
    const files: string[] = [];
    for (const [file, data] of Object.entries(fonts)) {
      if (!/^fonts\/[\w-]+\/[\w.-]+\.woff2$/.test(file)) throw new EditRefused("This font cannot be added.");
      if (existsSync(join(root, file))) continue;
      atomicWrite(join(root, file), data);
      files.push(file);
    }
    atomicWrite(join(root, "theme.css"), css);
    const change = { label: en.editing.labels.theme, files: ["theme.css", ...files] };
    this.deps.changed(change);
    return change;
  }

  /** What the preview needs to know before the maker edits an element. */
  info(file: string, at: number): EditInfo {
    const src = this.read(file);
    const include = includeAt(src, at);
    const el = include ? undefined : locate(src, at);
    const part = /^parts\/(.+)\.liquid$/.exec(file)?.[1];
    return {
      text: el ? !el.notEditable : false,
      computed: el?.notEditable === "liquid",
      movable: include ? true : !!el && !el.inLoop && el.whole,
      sharedBy: part ? pagesUsing(part, this.templates()) : 0,
    };
  }

  /** Every template of the project, path → text, to find what uses a part. */
  private templates(): Record<string, string> {
    const root = this.deps.root();
    const out: Record<string, string> = {};
    if (!root) return out;
    for (const dir of ["pages", "parts"]) {
      const walk = (rel: string) => {
        const abs = join(root, rel);
        if (!existsSync(abs)) return;
        for (const entry of readdirSync(abs, { withFileTypes: true })) {
          const path = `${rel}/${entry.name}`;
          if (entry.isDirectory()) walk(path);
          else if (entry.name.endsWith(".liquid")) out[path] = readFileSync(join(root, path), "utf8");
        }
      };
      walk(dir);
    }
    return out;
  }

  private abs(file: string): string {
    const root = this.deps.root();
    if (!root) throw new EditRefused("No project is open.");
    if (!EDITABLE.test(file) || file.split("/").includes("..")) throw new EditRefused("This file cannot be edited.");
    return join(root, file);
  }

  private read(file: string): string {
    try {
      return readFileSync(this.abs(file), "utf8");
    } catch (error) {
      if (error instanceof EditRefused) throw error;
      throw new EditRefused("This file has changed since it was shown.");
    }
  }

  private write(file: string, content: string) {
    atomicWrite(this.abs(file), content);
  }
}

/** Atomic: the preview and the agent never see half a file. The temporary file is hidden, so nothing follows it. */
function atomicWrite(abs: string, content: string | Buffer) {
  mkdirSync(dirname(abs), { recursive: true });
  const tmp = join(dirname(abs), `.${basename(abs)}.upstart-tmp`);
  writeFileSync(tmp, content);
  renameSync(tmp, abs);
}
