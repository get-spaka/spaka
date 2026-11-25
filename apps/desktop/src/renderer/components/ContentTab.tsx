// The Content tab (Q148, Q162-Q166): the project's datasources, a
// datasource's records, a record's form. Each change is written half a
// second after typing stops and the preview follows; leaving the record
// makes its one version. The maker adds, duplicates, deletes, reorders and
// renames records; the fields themselves are the agent's (Q163).
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  GripVertical,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ContentDatasource, ContentField, ContentRecord, ContentRecordSummary } from "../../shared/ipc";
import { spaka } from "../lib/bridge";
import { messageOf } from "../lib/errors";
import { pickImage, pickImages } from "../lib/picker";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";
import { CollectedView } from "./CollectedView";
import { MediaLibrary, MediaThumb } from "./MediaLibrary";
import { Button } from "./ui/button";
import { NativeSelect } from "./ui/native-select";
import { Tip } from "./ui/tip";

/** How long typing must stop before a change is written (Q162). */
const WRITE_AFTER = 500;

export function ContentTab({ working, onAsk }: { working: boolean; onAsk: (text: string) => void }) {
  const [list, setList] = useState<ContentDatasource[]>();
  // `key`: the form stays the same while its record gets an id or a new one (Q165).
  const [open, setOpen] = useState<{ datasource: string; record?: string | null; key?: number }>();
  const [error, setError] = useState<string>();
  // The tab's two parts (Q158): the datasources, the media library.
  const [section, setSection] = useState<"datasources" | "media">("datasources");
  const [deleted, setDeleted] = useState<{ name: string; at: number }>();
  const load = useCallback(
    () =>
      void spaka
        .invoke("content:list")
        .then(setList)
        .catch((e) => setError(messageOf(e))),
    [],
  );
  useEffect(() => {
    load();
    return spaka.on("content:changed", load);
  }, [load]);
  useEffect(() => {
    if (!deleted) return;
    const timer = setTimeout(() => setDeleted(undefined), 8000);
    return () => clearTimeout(timer);
  }, [deleted]);

  const act = (run: () => Promise<unknown>) => {
    setError(undefined);
    run()
      .then(load)
      .catch((e) => setError(messageOf(e)));
  };
  const ds = open && list?.find((d) => d.name === open.datasource);

  return (
    <fieldset data-testid="content" disabled={working} className="flex min-h-0 min-w-0 flex-1 flex-col">
      {working && <p className="px-4 pt-3 text-xs text-muted-foreground">{t.content.busy}</p>}
      {error && (
        <p data-testid="content-error" className="px-4 pt-3 text-xs text-destructive">
          {error}
        </p>
      )}
      {!list ? null : ds && open.record !== undefined ? (
        <RecordForm
          key={`${ds.name}/${open.key}`}
          ds={ds}
          id={open.record}
          working={working}
          onBack={() => setOpen({ datasource: ds.name })}
          onOpened={(id) => setOpen((o) => o && { ...o, record: id })}
          onAsk={onAsk}
        />
      ) : ds?.collected ? (
        <CollectedView
          ds={ds}
          onBack={() => setOpen(undefined)}
          onOpen={(record) => setOpen({ datasource: ds.name, record, key: Date.now() })}
          onAdd={() => setOpen({ datasource: ds.name, record: null, key: Date.now() })}
          onDeleteTest={(record) =>
            act(async () => {
              await spaka.invoke("content:delete", ds.name, record.id);
              setDeleted({ name: record.title, at: Date.now() });
            })
          }
          onAsk={onAsk}
        />
      ) : ds ? (
        <DatasourceView
          ds={ds}
          onBack={() => setOpen(undefined)}
          onOpen={(record) => setOpen({ datasource: ds.name, record, key: Date.now() })}
          onAdd={() => setOpen({ datasource: ds.name, record: null, key: Date.now() })}
          onDuplicate={(id) => act(() => spaka.invoke("content:duplicate", ds.name, id))}
          onDelete={(record) =>
            act(async () => {
              await spaka.invoke("content:delete", ds.name, record.id);
              setDeleted({ name: record.title, at: Date.now() });
            })
          }
          onReorder={(ids) => act(() => spaka.invoke("content:reorder", ds.name, ids))}
          onAsk={onAsk}
        />
      ) : (
        <>
          <div role="tablist" className="flex shrink-0 gap-1 px-4 pt-3 pb-2">
            {(["datasources", "media"] as const).map((name) => (
              <Tip key={name} text={t.content.sectionTips[name]}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={section === name}
                  data-testid={`content-${name}`}
                  onClick={() => setSection(name)}
                  className={cn(
                    "rounded-md px-2 py-1 text-xs font-medium",
                    section === name ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.content.sections[name]}
                </button>
              </Tip>
            ))}
          </div>
          {section === "media" ? (
            <MediaLibrary onError={setError} />
          ) : (
            <div className="flex-1 overflow-y-auto px-4 pb-3">
              {list.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">{t.content.none}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    tip={t.content.askForOneTip}
                    onClick={() => onAsk(t.content.askForOneMessage)}
                  >
                    {t.content.askForOne}
                  </Button>
                </div>
              ) : (
                <DatasourceList
                  list={list}
                  onOpen={(name) => setOpen({ datasource: name })}
                  onDelete={(d) =>
                    act(async () => {
                      await spaka.invoke("content:delete-datasource", d.name);
                      setDeleted({ name: d.label, at: Date.now() });
                    })
                  }
                />
              )}
            </div>
          )}
        </>
      )}
      {deleted && (
        <div
          data-testid="record-deleted"
          className="mx-4 mb-3 flex items-center gap-2 rounded-md bg-foreground px-3 py-2 text-xs text-background"
        >
          {t.content.deleted(deleted.name)}
          <Tip text={t.content.undoTip}>
            <button
              type="button"
              data-testid="record-deleted-undo"
              className="ml-auto rounded px-1.5 py-0.5 font-medium hover:bg-background/20"
              onClick={() => {
                setDeleted(undefined);
                void spaka.invoke("history:undo").then(load);
              }}
            >
              {t.content.undo}
            </button>
          </Tip>
        </div>
      )}
    </fieldset>
  );
}

function Header({ title, onBack, children }: { title: string; onBack: () => void; children?: React.ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
      <Button variant="ghost" size="icon-sm" onClick={onBack} tip={t.content.backTip} data-testid="content-back">
        <ChevronLeft />
      </Button>
      <h2 className="min-w-0 truncate text-sm font-medium">{title}</h2>
      <div className="ml-auto flex items-center gap-1">{children}</div>
    </div>
  );
}

function DatasourceView({
  ds,
  onBack,
  onOpen,
  onAdd,
  onDuplicate,
  onDelete,
  onReorder,
  onAsk,
}: {
  ds: ContentDatasource;
  onBack: () => void;
  onOpen: (id: string) => void;
  onAdd: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (record: ContentRecordSummary) => void;
  onReorder: (ids: string[]) => void;
  onAsk: (text: string) => void;
}) {
  const manual = !ds.sort;
  const [dragged, setDragged] = useState<string>();
  const [over, setOver] = useState<string>();
  const drop = (target: string) => {
    if (!dragged || dragged === target) return;
    const ids = ds.records.filter((r) => !r.skipped).map((r) => r.id);
    const from = ids.indexOf(dragged);
    ids.splice(from, 1);
    ids.splice(ids.indexOf(target) + (from <= ids.indexOf(target) ? 1 : 0), 0, dragged);
    onReorder(ids);
  };
  return (
    <>
      <Header title={ds.label} onBack={onBack}>
        <Button
          size="sm"
          variant="outline"
          onClick={onAdd}
          disabled={!!ds.problem}
          tip={t.content.addTip}
          data-testid="record-add"
        >
          <Plus />
          {t.content.add}
        </Button>
      </Header>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {ds.problem && <p className="px-2 pb-2 text-xs text-destructive">{ds.problem}</p>}
        {ds.records.length === 0 && <p className="px-2 py-2 text-sm text-muted-foreground">{t.content.noRecords}</p>}
        <ul data-testid="records">
          {ds.records.map((record) => (
            <li
              key={record.id}
              data-testid="record"
              data-id={record.id}
              draggable={manual && !record.skipped}
              onDragStart={(e) => {
                setDragged(record.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (!dragged || record.skipped) return;
                e.preventDefault();
                setOver(record.id);
              }}
              onDragLeave={() => setOver((o) => (o === record.id ? undefined : o))}
              onDrop={(e) => {
                e.preventDefault();
                drop(record.id);
                setDragged(undefined);
                setOver(undefined);
              }}
              onDragEnd={() => {
                setDragged(undefined);
                setOver(undefined);
              }}
              className={cn(
                "group flex items-center gap-1 rounded-md pr-1 hover:bg-accent",
                over === record.id && "ring-2 ring-ring/40",
                dragged === record.id && "opacity-50",
              )}
            >
              {manual && (
                <GripVertical
                  className="size-3.5 shrink-0 cursor-grab text-muted-foreground/60"
                  aria-label={t.content.dragToReorder}
                />
              )}
              <Tip text={t.content.openRecord}>
                <button
                  type="button"
                  onClick={() => onOpen(record.id)}
                  className={cn("flex min-w-0 flex-1 items-center gap-2 py-2 text-left text-sm", !manual && "pl-2")}
                >
                  <span className={cn("truncate", record.skipped && "text-muted-foreground line-through")}>
                    {record.title}
                  </span>
                  {record.problems.length > 0 && (
                    <AlertTriangle className="size-3.5 shrink-0 text-warning" aria-label={record.problems.join("; ")} />
                  )}
                </button>
              </Tip>
              <Button
                variant="ghost"
                size="icon-sm"
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                tip={t.content.duplicateTip}
                data-testid="record-duplicate"
                onClick={() => onDuplicate(record.id)}
              >
                <Copy />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                tip={t.content.deleteTip}
                data-testid="record-delete"
                onClick={() => onDelete(record)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
        <p className="px-2 pt-2 text-[11px] text-muted-foreground">
          {ds.sort
            ? t.content.sortedBy(ds.sort.field, ds.sort.desc)
            : ds.records.length > 1
              ? t.content.dragToReorder
              : ""}
        </p>
        <details data-testid="datasource-fields" className="mt-4 px-2 text-xs">
          <summary className="cursor-default font-medium text-muted-foreground">{t.content.fields}</summary>
          <ul className="mt-2 space-y-1">
            {ds.fields.map((f) => (
              <li key={f.name} className="flex gap-2">
                <span className="font-medium">{f.label ?? f.name}</span>
                <span className="text-muted-foreground">
                  {t.content.kinds[f.kind] ?? f.kind}
                  {f.required ? " *" : ""}
                </span>
              </li>
            ))}
          </ul>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            tip={t.content.askFieldsTip}
            onClick={() => onAsk(t.content.askFieldsMessage(ds.label))}
          >
            {t.content.askFields}
          </Button>
        </details>
      </div>
    </>
  );
}

type Values = Record<string, unknown>;

function RecordForm({
  ds,
  id: initialId,
  working,
  onBack,
  onOpened,
  onAsk,
}: {
  ds: ContentDatasource;
  /** null: a new record, written once the maker types. */
  id: string | null;
  working: boolean;
  onBack: () => void;
  onOpened: (id: string) => void;
  onAsk: (text: string) => void;
}) {
  const body = ds.body;
  const [record, setRecord] = useState<ContentRecord>();
  const [values, setValues] = useState<Values>({});
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<"saved" | "saving">();
  // What is still to write, the record's id once it has a file, and the writes in order.
  const pending = useRef(new Map<string, unknown>());
  const id = useRef(initialId);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastWrite = useRef(0);
  const opened = useRef(onOpened);
  opened.current = onOpened;
  // A new test record is written when the maker saves it, not as they type.
  const onSave = !initialId && ds.collected;

  const read = useCallback(() => {
    if (!id.current) return;
    void spaka
      .invoke("content:record", ds.name, id.current)
      .then((r) => {
        setRecord(r);
        if (!pending.current.size) setValues({ ...r.values, ...(body ? { [body]: r.body } : {}) });
      })
      .catch((e) => setError(messageOf(e)));
  }, [ds.name, body]);
  useEffect(() => {
    read();
    // Changed by someone else (the agent, a version brought back): read again, unless the maker is typing.
    return spaka.on("content:changed", () => {
      if (!pending.current.size && Date.now() - lastWrite.current > 1500) read();
    });
  }, [read]);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const changes = new Map(pending.current);
    pending.current.clear();
    if (!changes.size) return chain.current;
    setStatus("saving");
    chain.current = chain.current
      .then(async () => {
        lastWrite.current = Date.now();
        if (!id.current) {
          const added = await spaka.invoke("content:add", ds.name, Object.fromEntries(changes));
          id.current = added.id;
          opened.current(added.id);
        } else
          for (const [field, value] of changes)
            await spaka.invoke("content:set-value", ds.name, id.current, field, value);
        lastWrite.current = Date.now();
        setStatus("saved");
        setError(undefined);
      })
      .catch((e) => {
        setStatus(undefined);
        setError(messageOf(e));
      });
    return chain.current;
  }, [ds.name]);

  const change = (field: string, value: unknown) => {
    setValues((v) => ({ ...v, [field]: value }));
    if (onSave) return;
    // A new record is written with everything typed so far.
    if (!id.current) for (const [k, v] of Object.entries({ ...values, [field]: value })) pending.current.set(k, v);
    else pending.current.set(field, value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), WRITE_AFTER);
  };

  // Leaving the record, by Back or by another tab: what is left is written, then its version (Q162).
  const flushing = useRef(flush);
  flushing.current = flush;
  useEffect(() => () => void flushing.current().then(() => spaka.invoke("content:leave")), []);

  const save = () => {
    for (const [k, v] of Object.entries(values)) pending.current.set(k, v);
    void flush().then(() => {
      if (id.current) onBack();
    });
  };

  const fields = ds.fields.filter((f) => f.name !== body);
  const bodyField = body ? ds.fields.find((f) => f.name === body) : undefined;
  const title =
    record || id.current
      ? String(values[ds.fields.find((f) => f.kind === "text")?.name ?? "title"] ?? "") || (id.current ?? "")
      : t.content.newRecord;
  const problems = record?.error ? [record.error] : (record?.problems ?? []);

  return (
    <>
      <Header title={title || t.content.newRecord} onBack={onBack}>
        {onSave ? (
          <Button
            size="sm"
            className="h-7"
            disabled={working || status === "saving" || !Object.keys(values).length}
            onClick={save}
            tip={t.content.collected.saveTip}
            data-testid="record-save"
          >
            {t.content.collected.save}
          </Button>
        ) : (
          <span data-testid="record-status" className="text-[11px] text-muted-foreground">
            {status === "saving" ? t.content.saving : status === "saved" ? t.content.saved : ""}
          </span>
        )}
        {record?.route && (
          <Button
            variant="ghost"
            size="icon-sm"
            tip={t.content.openPage}
            onClick={() =>
              void spaka.invoke("preview:set-view", "page").then(() => spaka.invoke("preview:navigate", record.route!))
            }
          >
            <ExternalLink />
          </Button>
        )}
      </Header>
      <div data-testid="record-form" className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {error && <p className="text-xs text-destructive">{error}</p>}
        {problems.length > 0 && record && (
          <div
            data-testid="record-problems"
            className="rounded-md border border-warning/40 bg-warning-muted p-3 text-xs"
          >
            <p className="font-medium">{record.error ? t.content.skipped : t.content.problems}</p>
            <ul className="mt-1 list-disc pl-4">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              tip={t.content.askFixTip}
              onClick={() => onAsk(t.content.askFixMessage(record.file, problems))}
            >
              {t.content.askFix}
            </Button>
          </div>
        )}
        {/* A test record's id is when it was sent: it is not renamed. */}
        {record && id.current && !ds.collected && (
          <RecordId
            ds={ds}
            id={id.current}
            route={record.route}
            onRenamed={(to) => {
              id.current = to;
              onOpened(to);
              read();
            }}
            onError={setError}
          />
        )}
        {!record?.error &&
          fields.map((field) => (
            <FieldInput
              key={field.name}
              field={field}
              value={values[field.name]}
              disabled={working}
              onChange={(v) => change(field.name, v)}
            />
          ))}
        {bodyField && (
          <FieldInput
            field={bodyField}
            value={values[bodyField.name]}
            disabled={working}
            onChange={(v) => change(bodyField.name, v)}
            tall
          />
        )}
      </div>
    </>
  );
}

/** The record's id, its page's address: changed on purpose, with what it breaks said (Q165). */
function RecordId({
  ds,
  id,
  route,
  onRenamed,
  onError,
}: {
  ds: ContentDatasource;
  id: string;
  route?: string;
  onRenamed: (id: string) => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState<string>();
  const save = () => {
    const to = editing?.trim();
    setEditing(undefined);
    if (!to || to === id) return;
    void spaka
      .invoke("content:leave")
      .then(() => spaka.invoke("content:rename", ds.name, id, to))
      .then((r) => onRenamed(r.id))
      .catch((e) => onError(messageOf(e)));
  };
  return (
    <div className="text-xs">
      <span className="text-muted-foreground">{t.content.id}</span>
      {editing === undefined ? (
        <div className="mt-1 flex items-center gap-2">
          <code data-testid="record-id" className="truncate rounded bg-muted px-1.5 py-0.5">
            {route ?? id}
          </code>
          <Tip text={t.content.renameTip}>
            <button
              type="button"
              className="text-muted-foreground underline"
              onClick={() => setEditing(id)}
              data-testid="record-rename"
            >
              {t.content.rename}
            </button>
          </Tip>
        </div>
      ) : (
        <div className="mt-1 space-y-1">
          <div className="flex items-center gap-2">
            <input
              data-testid="record-id-input"
              value={editing}
              // biome-ignore lint/a11y/noAutofocus: shown because the maker clicked "Change"
              autoFocus
              onChange={(e) => setEditing(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") setEditing(undefined);
              }}
              className="h-7 flex-1 rounded-md border bg-background px-2 font-mono"
            />
            <Button size="sm" onClick={save} tip={t.content.renameSaveTip} data-testid="record-id-save">
              {t.content.renameSave}
            </Button>
            <Button size="sm" variant="ghost" tip={t.content.renameCancelTip} onClick={() => setEditing(undefined)}>
              {t.content.renameCancel}
            </Button>
          </div>
          {route && <p className="text-warning">{t.content.renameWarning(route)}</p>}
        </div>
      )}
    </div>
  );
}

const INPUT =
  "w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:opacity-60";

function FieldInput({
  field,
  value,
  disabled,
  onChange,
  tall,
}: {
  field: ContentField;
  value: unknown;
  disabled: boolean;
  onChange: (value: unknown) => void;
  tall?: boolean;
}) {
  const label = field.label ?? field.name.charAt(0).toUpperCase() + field.name.slice(1).replace(/_/g, " ");
  const text = value === undefined || value === null ? "" : Array.isArray(value) ? value.join("\n") : String(value);
  const common = { "data-testid": `field-${field.name}`, disabled, "aria-label": label };
  let input: React.ReactNode;
  switch (field.kind) {
    case "markdown":
    case "list":
      input = (
        <textarea
          {...common}
          value={text}
          rows={field.kind === "list" ? 3 : tall ? 12 : 5}
          placeholder={field.kind === "list" ? t.content.listHint : undefined}
          onChange={(e) =>
            onChange(
              field.kind === "list"
                ? e.target.value
                    .split("\n")
                    .map((s) => s.trim())
                    .filter((s, i, all) => s || i < all.length - 1)
                : e.target.value,
            )
          }
          className={cn(INPUT, "resize-y", field.kind === "markdown" && "font-mono text-[13px]")}
        />
      );
      break;
    case "number":
      input = (
        <input
          {...common}
          type="number"
          value={text}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          className={INPUT}
        />
      );
      break;
    case "boolean":
      input = (
        <label className="flex items-center gap-2 text-sm">
          <input {...common} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          {t.content.yes}
        </label>
      );
      break;
    case "date":
      input = (
        <input
          {...common}
          type="date"
          value={text.slice(0, 10)}
          onChange={(e) => onChange(e.target.value)}
          className={INPUT}
        />
      );
      break;
    case "choice":
      input = (
        <NativeSelect
          {...common}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          className={cn(INPUT, "h-auto pr-9 shadow-none")}
          wrapperClassName="w-full"
        >
          <option value="">{t.content.noChoice}</option>
          {(field.choices ?? []).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </NativeSelect>
      );
      break;
    case "links":
      input = (
        <LinksInput
          name={field.name}
          label={label}
          value={Array.isArray(value) ? (value as Link[]) : []}
          disabled={disabled}
          onChange={onChange}
        />
      );
      break;
    case "images":
      input = (
        <ImagesInput
          name={field.name}
          label={label}
          value={Array.isArray(value) ? value.map(String) : typeof value === "string" && value ? [value] : []}
          disabled={disabled}
          onChange={onChange}
        />
      );
      break;
    case "image":
      input = (
        <div className="flex items-center gap-2">
          {text ? (
            <MediaThumb path={text} className="h-14 w-20 shrink-0 rounded-md border" />
          ) : (
            <div className="h-14 w-20 shrink-0 rounded-md border border-dashed" />
          )}
          <span
            data-testid={`field-${field.name}`}
            className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground"
          >
            {text}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            tip={t.content.chooseTip}
            data-testid={`field-${field.name}-choose`}
            onClick={() => void pickImage().then((path) => path && onChange(path))}
          >
            {t.content.choose}
          </Button>
          {text && (
            <Button size="sm" variant="ghost" disabled={disabled} tip={t.content.clearTip} onClick={() => onChange("")}>
              {t.content.clear}
            </Button>
          )}
        </div>
      );
      break;
    default:
      input = (
        <input
          {...common}
          type={field.kind === "email" ? "email" : field.kind === "phone" ? "tel" : "text"}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          className={INPUT}
        />
      );
  }
  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
        {field.required ? " *" : ""}
      </span>
      {input}
    </div>
  );
}

/**
 * A list of images as a grid of thumbnails (Q354): "Add…" chooses several in
 * the media picker; each moves earlier or later, is removed, is replaced by a
 * click, or is dragged to another place.
 */
function ImagesInput({
  name,
  label,
  value,
  disabled,
  onChange,
}: {
  name: string;
  label: string;
  value: string[];
  disabled: boolean;
  onChange: (value: string[]) => void;
}) {
  const [dragged, setDragged] = useState<number>();
  const [over, setOver] = useState<number>();
  const words = t.content.images;
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= value.length) return;
    const next = [...value];
    const [image] = next.splice(from, 1);
    next.splice(to, 0, image!);
    onChange(next);
  };
  return (
    <fieldset className="min-w-0 space-y-2" data-testid={`field-${name}`} aria-label={label}>
      {value.length ? (
        <ul className="grid grid-cols-3 gap-2">
          {value.map((path, i) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: an image may be in the list twice; its place is its identity.
              key={`${i}-${path}`}
              data-testid="image-item"
              data-path={path}
              draggable={!disabled}
              onDragStart={(e) => {
                setDragged(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (dragged === undefined) return;
                e.preventDefault();
                setOver(i);
              }}
              onDragLeave={() => setOver((o) => (o === i ? undefined : o))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragged !== undefined) move(dragged, i);
                setDragged(undefined);
                setOver(undefined);
              }}
              onDragEnd={() => {
                setDragged(undefined);
                setOver(undefined);
              }}
              className={cn(
                "group space-y-1 rounded-md",
                dragged === i && "opacity-50",
                over === i && dragged !== i && "ring-2 ring-primary",
              )}
            >
              <Tip text={words.replaceTip}>
                <button
                  type="button"
                  disabled={disabled}
                  data-testid="image-replace"
                  className="block w-full overflow-hidden rounded-md border"
                  onClick={() =>
                    void pickImage().then((chosen) => chosen && onChange(value.map((p, j) => (j === i ? chosen : p))))
                  }
                >
                  <MediaThumb path={path} className="aspect-[4/3] w-full" />
                </button>
              </Tip>
              <div className="flex items-center justify-center">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={disabled || i === 0}
                  tip={words.earlier}
                  data-testid="image-earlier"
                  onClick={() => move(i, i - 1)}
                >
                  <ArrowLeft />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={disabled || i === value.length - 1}
                  tip={words.later}
                  data-testid="image-later"
                  onClick={() => move(i, i + 1)}
                >
                  <ArrowRight />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={disabled}
                  tip={words.remove}
                  data-testid="image-remove"
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                >
                  <X />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">{words.empty}</p>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        tip={words.addTip}
        data-testid="images-add"
        onClick={() => void pickImages().then((chosen) => chosen && onChange([...value, ...chosen]))}
      >
        <Plus />
        {words.add}
      </Button>
    </fieldset>
  );
}

type Link = { label: string; href: string };

/** A list of links edited as rows (Q212): a label and an address each, added, moved and removed. */
function LinksInput({
  name,
  label,
  value,
  disabled,
  onChange,
}: {
  name: string;
  label: string;
  value: Link[];
  disabled: boolean;
  onChange: (value: Link[]) => void;
}) {
  const rows = value.map((link) => ({ label: String(link?.label ?? ""), href: String(link?.href ?? "") }));
  const set = (i: number, change: Partial<Link>) =>
    onChange(rows.map((row, j) => (j === i ? { ...row, ...change } : row)));
  const move = (i: number, by: number) => {
    const next = [...rows];
    const [row] = next.splice(i, 1);
    next.splice(i + by, 0, row!);
    onChange(next);
  };
  const words = t.content.links;
  return (
    <fieldset className="min-w-0 space-y-1.5" data-testid={`field-${name}`} aria-label={label}>
      {rows.map((row, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the rows have no identity but their place.
        <div key={i} className="flex items-center gap-1" data-testid="link-row">
          <input
            value={row.label}
            disabled={disabled}
            placeholder={words.label}
            aria-label={`${words.label} ${i + 1}`}
            data-testid="link-label"
            onChange={(e) => set(i, { label: e.target.value })}
            className={cn(INPUT, "min-w-0 flex-1")}
          />
          <input
            value={row.href}
            disabled={disabled}
            placeholder={words.href}
            aria-label={`${words.href} ${i + 1}`}
            data-testid="link-href"
            onChange={(e) => set(i, { href: e.target.value })}
            className={cn(INPUT, "min-w-0 flex-1 font-mono text-xs")}
          />
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={disabled || i === 0}
            tip={words.up}
            onClick={() => move(i, -1)}
          >
            <ArrowUp />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={disabled || i === rows.length - 1}
            tip={words.down}
            onClick={() => move(i, 1)}
          >
            <ArrowDown />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={disabled}
            tip={words.remove}
            data-testid="link-remove"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
          >
            <X />
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        tip={words.addTip}
        data-testid="link-add"
        onClick={() => onChange([...rows, { label: "", href: "" }])}
      >
        <Plus />
        {words.add}
      </Button>
    </fieldset>
  );
}

/**
 * The datasources (Q210): the collections and the navigation first, then the
 * section lists under the page each belongs to. One no page shows is marked,
 * and a section list of that kind can be deleted (Q211).
 */
function DatasourceList({
  list,
  onOpen,
  onDelete,
}: {
  list: ContentDatasource[];
  onOpen: (name: string) => void;
  onDelete: (d: ContentDatasource) => void;
}) {
  const collections = list.filter((d) => !d.section);
  const pages = new Map<string, ContentDatasource[]>();
  for (const d of list) if (d.section) pages.set(d.section.route, [...(pages.get(d.section.route) ?? []), d]);
  const row = (d: ContentDatasource) => (
    <li key={d.name} className="group flex items-center">
      <Tip text={t.content.openDatasource}>
        <button
          type="button"
          data-testid="datasource"
          data-name={d.name}
          data-unused={d.usedBy.length === 0 || undefined}
          onClick={() => onOpen(d.name)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
        >
          <span className="truncate font-medium">{d.label}</span>
          {(d.problem || d.records.some((r) => r.problems.length)) && (
            <AlertTriangle className="size-3.5 shrink-0 text-warning" />
          )}
          {d.usedBy.length === 0 && (
            <span className="shrink-0 text-xs text-muted-foreground" data-testid="datasource-unused">
              {t.content.unused}
            </span>
          )}
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">{t.content.records(d.records.length)}</span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </Tip>
      {d.section && d.usedBy.length === 0 && (
        <Button
          size="icon-sm"
          variant="ghost"
          tip={t.content.deleteList(d.label)}
          data-testid="datasource-delete"
          onClick={() => onDelete(d)}
        >
          <Trash2 />
        </Button>
      )}
    </li>
  );
  return (
    <div className="space-y-4" data-testid="datasource-list">
      {collections.length > 0 && <ul className="-mx-2">{collections.map(row)}</ul>}
      {pages.size > 0 && (
        <div className="space-y-2" data-testid="datasource-sections">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t.content.sectionsTitle}
          </h3>
          {[...pages].map(([route, items]) => (
            <div key={route} data-testid="datasource-page" data-route={route}>
              <p className="text-xs text-muted-foreground">{route === "/" ? t.content.homePage : route}</p>
              <ul className="-mx-2">{items.map(row)}</ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
