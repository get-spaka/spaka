// The preview's test records (Q172): records of collected datasources kept as
// files in .upstart/test-records/<name>/<id>.md, in an authored record's
// format, never published. The agent writes them like any file, so the
// preview follows one being written; a form tried in the preview adds one.
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  type CollectedStore,
  type Datasources,
  newRecordText,
  type Overlay,
  type ProjectSource,
  readRecordFile,
  type StoredRecord,
  TEST_RECORDS_DIR,
} from "@upstart/runtime";
import { diskSource } from "@upstart/runtime/node";

const PREFIX = `${TEST_RECORDS_DIR}/`;

/** The test records as a source of `<name>/<id>.md`, what the agent is writing included. */
export function testRecordsSource(root: string, overlay: Overlay): ProjectSource {
  const disk = diskSource(join(root, TEST_RECORDS_DIR));
  return {
    read: (path) => (overlay.has(PREFIX + path) ? overlay.read(PREFIX + path) : disk.read(path)),
    list: (dir) => {
      const all = new Set(disk.list(dir));
      const prefix = `${PREFIX}${dir.replace(/\/$/, "")}/`;
      for (const path of overlay.paths()) if (path.startsWith(prefix)) all.add(path.slice(PREFIX.length));
      return [...all].sort();
    },
    writing: (path) =>
      path === undefined ? overlay.paths().some((p) => p.startsWith(PREFIX)) : overlay.writing(PREFIX + path),
  };
}

/** A test record's file in the project. */
export function testRecordFile(name: string, id: string): string {
  return `${PREFIX}${name}/${id}.md`;
}

/** Whether a project file is a test record's. */
export function isTestRecord(path: string): boolean {
  return /^\.upstart\/test-records\/[a-z0-9][\w-]*\/[a-z0-9][\w-]*\.md$/i.test(path);
}

/** Where a form tried in the preview keeps what was sent: a new test record's file. */
export class TestRecordStore implements CollectedStore {
  constructor(
    private readonly root: string,
    private readonly data: () => Datasources,
    private readonly written: (file: string) => void,
  ) {}

  async list(datasource: string, limit: number): Promise<StoredRecord[]> {
    const source = diskSource(join(this.root, TEST_RECORDS_DIR));
    return source
      .list(datasource)
      .map((path) => {
        const { values, body } = readRecordFile(source.read(path) ?? "");
        const { submitted, status, ...fields } = values;
        const bodyField = this.data().definition(datasource).definition?.body;
        if (bodyField && body.trim()) fields[bodyField] = body;
        return {
          id: path.slice(datasource.length + 1, -3),
          submitted: typeof submitted === "string" ? submitted : "",
          status: status === "pending" ? "pending" : "published",
          fields,
        } satisfies StoredRecord;
      })
      .sort((a, b) => b.submitted.localeCompare(a.submitted))
      .slice(0, limit);
  }

  async add(datasource: string, record: StoredRecord): Promise<void> {
    const bodyField = this.data().definition(datasource).definition?.body;
    const { [bodyField ?? ""]: body, ...fields } = record.fields;
    const values: Record<string, unknown> = { ...fields, submitted: record.submitted };
    if (record.status === "pending") values.status = "pending";
    const file = testRecordFile(datasource, record.id);
    const abs = join(this.root, file);
    mkdirSync(dirname(abs), { recursive: true });
    const tmp = join(dirname(abs), `.${record.id}.upstart-tmp`);
    writeFileSync(tmp, newRecordText(values, typeof body === "string" ? body : ""));
    renameSync(tmp, abs);
    this.written(file);
  }

  // The preview has no per-visitor limit: the maker tries a form as often as needed.
  async sentSince(): Promise<number> {
    return 0;
  }

  async approve(): Promise<boolean> {
    return false;
  }

  async delete(datasource: string, id: string): Promise<boolean> {
    rmSync(join(this.root, testRecordFile(datasource, id)), { force: true });
    return true;
  }
}
