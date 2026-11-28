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
  moveRecordItem,
  newRecordText,
  RecordWriteRefused,
  readRecordFile,
  recordFieldAt,
  recordFile,
  recordIdFrom,
  recordOf,
  recordTitle,
  removeRecordItem,
  renameInOrder,
  sections,
  setOrder,
  setRecordValue,
  setRecordValueAt,
  submissionId,
  validRecordId,
} from "@spaka/runtime";
import { diskSource } from "@spaka/runtime/node";
import { cleanFrame, FORMATS } from "../../shared/frame";
import type { EditAction, EditInfo } from "../../shared/ipc";
import { copyOfPage } from "../../shared/page-grid";
import { en } from "../../shared/strings/en";
import { addFile, addImage, mediaKind, replaceUses, slug, usesLabel, usesOf, usingFiles } from "../media/library";
import type { ImageFinder } from "../media/search";
import { testRecordFile } from "../preview/test-records";
import { replaceFile } from "../replace-file";
import { type DroppedBlock, dropData, type ProjectView } from "./data-drop";
import {
  copyName,
  duplicateRange,
  EditRefused,
  editText,
  imageFrames,
  includeAt,
  insertBefore,
  moveSection,
  pagesUsing,
  placeFor,
  removeRange,
  renameInclude,
  setImageFrame,
  setImageSource,
  setLink,
  targetAt,
} from "./edits";
import { diskView, projectTemplates } from "./use-blocks";

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
  /^((pages|parts|fragments)\/[\w./[\]-]+\.liquid|data\/[a-z0-9][\w-]*\/([a-z0-9][\w-]*\.md|_datasource\.yaml)|media\/[\w.-]+\.json|\.spaka\/test-records\/[a-z0-9][\w-]*\/[a-z0-9][\w-]*\.md)$/i;
/** A record's file: an authored record, or a collected datasource's test record (Q172). */
const RECORD = /^(data|\.spaka\/test-records)\/[a-z0-9][\w-]*\/[a-z0-9][\w-]*\.md$/i;

export type EditorDeps = {
  /** The open project's folder. */
  root: () => string | undefined;
  /** Whether the agent is in the middle of a turn: editing waits (Q91). */
  busy: () => boolean;
  /** Called before anything is written: what changed outside the app gets its own snapshot first. */
  before: () => void;
  /** Called once a change is on the disk, with what it was, for the history and the agent. */
  changed: (change: { label: string; files: string[] }) => void;
  /** A gallery block: its kind and template (Q92), and for a data block its datasource and record page (Q194). */
  block: (id: string) => DroppedBlock | undefined;
  /** What kind of change the maker made, for the anonymous statistics (Q334). */
  did?: (what: "page" | "block" | "theme" | "content") => void;
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
    // A collected datasource's record added here is a test record, named after when it was "sent" (Q172).
    if (definition.collected) values = { ...values, submitted: new Date().toISOString() };
    const title = recordTitle({ id: "", __ref: "", ...values }, definition);
    const id = definition.collected
      ? submissionId(new Date())
      : recordIdFrom(title, (id) => existsSync(this.abs(recordFile(datasource, id))));
    const file = definition.collected ? testRecordFile(datasource, id) : recordFile(datasource, id);
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
    this.deps.did?.("content");
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
    this.deps.did?.("content");
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
    this.deps.did?.("content");
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

  /**
   * An edit from the preview. An image file dropped onto an image is added
   * to media/ first, and the image replaced with it: one version (Q159).
   */
  async edit(action: EditAction): Promise<{ label: string; files: string[] }> {
    if (action.type !== "image" || !action.from) return this.apply(action);
    if (mediaKind(action.from) !== "image") throw new EditRefused(en.editing.notAnImage(basename(action.from)));
    this.ready();
    const added = await addFile(this.root(), action.from);
    const files = [added.path, infoFile(added.path)].filter((f) => existsSync(join(this.root(), f)));
    try {
      return this.applyNow({ ...action, from: undefined, src: `/${added.path}` }, files);
    } catch (error) {
      // The file stays in the library, with its own version.
      this.deps.changed({ label: en.editing.labels.mediaAdded(1), files });
      throw error;
    }
  }

  apply(action: EditAction): { label: string; files: string[] } {
    this.ready();
    return this.applyNow(action, []);
  }

  private applyNow(action: EditAction, added: string[]): { label: string; files: string[] } {
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
        // Its datasource, its sample records, its record page, the site's navigation (Q194-Q209).
        const drop = dropData({ ...block, id: action.block }, action.file, this.view());
        Object.assign(writes, drop.writes);
        // A second copy names its ids and radio groups after itself, so that two on one page stay apart.
        const source = name === action.block ? drop.source : drop.source.replaceAll(action.block, name);
        writes[`parts/${name}.liquid`] = source.endsWith("\n") ? source : `${source}\n`;
        const index = action.before === "auto" ? placeFor(src, block.kind) : sectionIndex(src, action.before);
        writes[action.file] = insertBefore(src, index, `{% render '${name}' %}`);
        label = !drop.datasource
          ? t.inserted
          : drop.reused
            ? t.insertedReusing(drop.datasource)
            : drop.recordPage
              ? t.insertedWithPage(drop.datasource)
              : t.insertedWithData(drop.datasource);
        break;
      }
      case "record-text": {
        // The record's field the element shows alone (Q148).
        const file = this.recordFileFor(action.file, src, action.at, action.record, undefined, en.editor.computed);
        const text = action.text.replace(/\s+/g, " ").trim();
        if (file.item && file.kind === "links" && file.item.sub === "label") {
          if (!text) throw new EditRefused(en.editing.fieldNotText);
          writes[file.path] = this.recordValueAt(file.path, [file.field, file.item.index, "label"], text);
        } else {
          if (file.kind !== "text" || file.item) throw new EditRefused(en.editing.fieldNotText);
          writes[file.path] = this.recordValue(file.path, file.field, text);
        }
        label = "";
        break;
      }
      case "image":
        if (action.record) {
          const file = this.recordFileFor(action.file, src, action.at, action.record, "src", en.editing.notRecordImage);
          // One image of a list of images, or a record's image field (Q355).
          if (file.kind === "images" && file.item?.whole)
            writes[file.path] = this.recordList(file.path, (text) =>
              setRecordValueAt(text, [file.field, file.item!.index], action.src),
            );
          else if (file.kind === "image" && !file.item)
            writes[file.path] = this.recordValue(file.path, file.field, action.src);
          else throw new EditRefused(en.editing.notRecordImage);
        } else writes[action.file] = setImageSource(src, action.at, action.src, this.altOf(action.src));
        label = t.imageReplaced;
        break;
      case "image-frame": {
        // Set in its frame, or put back as the template's classes have it (Q547).
        const framed = setImageFrame(
          src,
          action.at,
          action.frame === null ? null : cleanFrame(action.frame),
          FORMATS.filter((format) => action.formats.includes(format)),
        );
        // Nothing to take out, or the same frame again: no version says the image changed.
        if (framed === src) return { label: t.imageAdjusted, files: [] };
        writes[action.file] = framed;
        label = t.imageAdjusted;
        break;
      }
      case "record-item": {
        // An image taken out of its list, or moved in it (Q356).
        const file = this.recordFileFor(action.file, src, action.at, action.record, "src", en.editing.notRecordImage);
        const item = file.item;
        if (file.kind !== "images" || !item?.whole) throw new EditRefused(en.editing.notRecordImage);
        writes[file.path] = this.recordList(file.path, (text) =>
          action.op === "remove"
            ? removeRecordItem(text, file.field, item.index)
            : moveRecordItem(text, file.field, item.index, action.to),
        );
        label = action.op === "remove" ? t.imageRemoved : t.imageMoved;
        break;
      }
    }
    for (const [file, content] of Object.entries(writes)) this.write(file, content);
    // A record's title may be the text just written.
    if (action.type === "record-text") label = t.recordEdited(this.recordName(Object.keys(writes)[0]!));
    const change = { label, files: [...added, ...Object.keys(writes)] };
    this.deps.changed(change);
    this.deps.did?.(action.type === "insert" ? "block" : "page");
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

  /** Deletes a datasource's folder, its definition and records (Q211); the history can bring it back. */
  deleteDatasource(name: string, label: string): { label: string; files: string[] } {
    this.ready();
    if (!/^[a-z0-9][\w-]*$/i.test(name)) throw new EditRefused("No such datasource.");
    const dir = join(this.root(), "data", name);
    if (!existsSync(dir)) throw new EditRefused("No such datasource.");
    const files = readdirSync(dir).map((f) => `data/${name}/${f}`);
    rmSync(dir, { recursive: true, force: true });
    const change = { label: en.editing.labels.datasourceDeleted(label), files };
    this.deps.changed(change);
    this.deps.did?.("content");
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
    this.deps.did?.("content");
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
    this.deps.did?.("content");
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
    this.deps.did?.("theme");
    return change;
  }

  /**
   * What the preview needs to know before the maker edits an element;
   * `record` is the one its trace names, for an image of a list of images.
   */
  info(file: string, at: number, record?: string): EditInfo {
    const src = this.read(file);
    const include = includeAt(src, at);
    const el = include ? undefined : locate(src, at);
    const part = /^parts\/(.+)\.liquid$/.exec(file)?.[1];
    const shown = el?.notEditable === "liquid" ? this.recordField(file, src, at) : undefined;
    // A text field, or a link's label in a list of links (Q212).
    const field =
      shown?.kind === "text" && !shown.sub
        ? shown.field
        : shown?.kind === "links" && shown.sub === "label"
          ? `${shown.field}.label`
          : undefined;
    return {
      text: el ? !el.notEditable || !!field : false,
      computed: el?.notEditable === "liquid" && !field,
      movable: include ? true : !!el && !el.inLoop && el.whole,
      sharedBy: part ? pagesUsing(part, this.templates()) : 0,
      ...(field ? { field } : shown?.kind ? { fromRecord: true } : {}),
      ...(el?.name === "img" ? this.imageInfo(file, src, at, record) : {}),
    };
  }

  /**
   * Whether an image can be replaced: its address written in the template, a
   * record's image field (Q159), or one image of a record's list of images,
   * with how many the list holds (Q355, Q356).
   */
  private imageInfo(file: string, src: string, at: number, record?: string): Pick<EditInfo, "image"> {
    const tag = src.slice(at, src.indexOf(">", at) + 1);
    const address = /\ssrc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i.exec(tag)?.[1];
    if (!address || !/\{[{%]/.test(address)) {
      // Written here for this place alone: it can be set in its frame too (Q547).
      const frame = imageFrames(src, at);
      return { image: frame ? { frame } : {} };
    }
    const shown = this.recordField(file, src, at, "src");
    if (shown?.kind === "image" && !shown.sub && !shown.item) return { image: { field: shown.field } };
    if (shown?.kind !== "images" || !shown.item) return {};
    let count: number | undefined;
    const of = record && /^([a-z0-9][\w-]*)\/([a-z0-9][\w-]*)#\d+$/i.exec(record);
    if (of && of[1] === shown.datasource)
      try {
        const list = readRecordFile(this.read(recordFile(of[1]!, of[2]!))).values[shown.field];
        count = Array.isArray(list) ? list.length : typeof list === "string" ? 1 : 0;
      } catch {}
    return { image: { field: shown.field, list: count === undefined ? {} : { count } } };
  }

  /**
   * The record's field an element shows alone, in its text or an attribute,
   * with its kind: the datasource is the loop's, or a record page's own.
   */
  private recordField(file: string, src: string, at: number, attribute?: string) {
    const found = recordFieldAt(src, at, attribute);
    const datasource = found && (found.datasource ?? /\[([a-z0-9][\w-]*)\]\.liquid$/i.exec(file)?.[1]);
    if (!found || !datasource) return undefined;
    let kind: string | undefined;
    try {
      kind = this.datasources()
        .definition(datasource)
        .definition?.fields.find((f) => f.name === found.field)?.kind;
    } catch {}
    return {
      datasource,
      field: found.field,
      kind,
      ...(found.sub ? { sub: found.sub } : {}),
      ...(found.item ? { item: true } : {}),
    };
  }

  /** The file of the record an edit names, checked against the field the element shows. */
  private recordFileFor(
    file: string,
    src: string,
    at: number,
    record: string,
    attribute: string | undefined,
    refused: string,
  ) {
    const shown = this.recordField(file, src, at, attribute);
    // "team/anna", or "navigation/services#2" for the third of its links, "homes/wren#1" for its second image.
    const of = /^([a-z0-9][\w-]*)\/([a-z0-9][\w-]*)(?:#(\d+))?$/i.exec(record);
    const inList = !!shown?.sub || !!shown?.item;
    if (!shown || !of || of[1] !== shown.datasource || inList !== (of[3] !== undefined)) throw new EditRefused(refused);
    return {
      path: recordFile(of[1]!, of[2]!),
      field: shown.field,
      kind: shown.kind,
      ...(inList ? { item: { index: Number(of[3]), sub: shown.sub, whole: !!shown.item } } : {}),
    };
  }

  /** A record's file with one of its lists changed (an image of a list of images). */
  private recordList(file: string, change: (text: string) => string): string {
    try {
      return change(this.read(file));
    } catch (error) {
      if (error instanceof RecordWriteRefused) throw new EditRefused(error.message);
      throw error;
    }
  }

  /** A record's file with one value inside a list changed. */
  private recordValueAt(file: string, path: [string, number, string], value: string): string {
    try {
      return setRecordValueAt(this.read(file), path, value);
    } catch (error) {
      if (error instanceof RecordWriteRefused) throw new EditRefused(error.message);
      throw error;
    }
  }

  /** A record's file with one value changed. */
  private recordValue(file: string, field: string, value: unknown): string {
    try {
      return setRecordValue(this.read(file), field, value, false);
    } catch (error) {
      if (error instanceof RecordWriteRefused) throw new EditRefused(error.message);
      throw error;
    }
  }

  /** The alt text kept beside a media file, if any. */
  private altOf(address: string): string | undefined {
    const path = address.replace(/^\//, "");
    if (!/^media\/[\w][\w.-]*$/.test(path)) return undefined;
    try {
      const alt = JSON.parse(readFileSync(join(this.root(), infoFile(path)), "utf8")).alt;
      return typeof alt === "string" ? alt : undefined;
    } catch {
      return undefined;
    }
  }

  /** The project as a dropped block's datasource needs to see it. */
  private view(): ProjectView {
    // Read only: a datasource's folder is looked at too, never anything outside the project.
    return diskView(this.root());
  }

  /** Every template of the project, path → text, to find what uses a part. */
  private templates(): Record<string, string> {
    const root = this.deps.root();
    return root ? projectTemplates(root) : {};
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
  const tmp = join(dirname(abs), `.${basename(abs)}.spaka-tmp`);
  writeFileSync(tmp, content);
  replaceFile(tmp, abs);
}
