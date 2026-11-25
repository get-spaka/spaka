// A collected datasource in the Content tab (Q177, Q184, Q185): one list of
// what the published site collected, read when the maker opens it, and of
// the preview's test records, marked as such; those waiting for review are
// marked and approved here; a published record is deleted for good after a
// confirmation; the published records are downloaded as CSV.
import { AlertTriangle, Check, ChevronLeft, Download, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ContentDatasource, ContentRecordSummary, PublishedRecord } from "../../shared/ipc";
import { spaka } from "../lib/bridge";
import { messageOf } from "../lib/errors";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Tip } from "./ui/tip";

type Published = { records: PublishedRecord[] } | { error: string; reason: string };
type Row =
  | { kind: "published"; id: string; submitted: string; record: PublishedRecord }
  | { kind: "test"; id: string; submitted: string; record: ContentRecordSummary };

const when = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

export function CollectedView({
  ds,
  onBack,
  onOpen,
  onAdd,
  onDeleteTest,
  onAsk,
}: {
  ds: ContentDatasource;
  onBack: () => void;
  onOpen: (id: string) => void;
  onAdd: () => void;
  onDeleteTest: (record: ContentRecordSummary) => void;
  onAsk: (text: string) => void;
}) {
  const [published, setPublished] = useState<Published>();
  const [open, setOpen] = useState<string>();
  const [confirming, setConfirming] = useState<string>();
  const [note, setNote] = useState<string>();
  const [error, setError] = useState<string>();
  const titleField = ds.fields.find((f) => f.kind === "text")?.name;

  const read = useCallback(
    () =>
      void spaka
        .invoke("content:published", ds.name)
        .then(setPublished)
        .catch((e) => setPublished({ error: messageOf(e), reason: "failed" })),
    [ds.name],
  );
  useEffect(read, [read]);

  const act = (run: () => Promise<unknown>) => {
    setError(undefined);
    run()
      .then(read)
      .catch((e) => setError(messageOf(e)));
  };

  const rows: Row[] = [
    ...(published && "records" in published
      ? published.records.map(
          (record): Row => ({ kind: "published", id: record.id, submitted: record.submitted, record }),
        )
      : []),
    ...ds.records.map((record): Row => ({ kind: "test", id: record.id, submitted: record.submitted ?? "", record })),
  ].sort((a, b) => b.submitted.localeCompare(a.submitted));
  const connected = !!published && "records" in published;

  return (
    <>
      <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
        <Button variant="ghost" size="icon-sm" onClick={onBack} tip={t.content.backTip} data-testid="content-back">
          <ChevronLeft />
        </Button>
        <h2 className="min-w-0 truncate text-sm font-medium">{ds.label}</h2>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={!published || rows.length === 0}
            tip={t.content.collected.csvTitle}
            data-testid="collected-csv"
            onClick={() =>
              act(async () => {
                const path = await spaka.invoke("content:csv", ds.name);
                if (path) setNote(t.content.collected.csvSaved(path));
              })
            }
          >
            <Download />
            {t.content.collected.csv}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onAdd}
            disabled={!!ds.problem}
            tip={t.content.collected.addTestTip}
            data-testid="record-add"
          >
            <Plus />
            {t.content.collected.addTest}
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2" data-testid="collected" data-connected={connected}>
        {ds.problem && <p className="px-2 pb-2 text-xs text-destructive">{ds.problem}</p>}
        {!published ? (
          <p className="px-2 pb-2 text-xs text-muted-foreground">{t.content.collected.reading}</p>
        ) : "error" in published ? (
          <p
            data-testid="collected-site"
            data-reason={published.reason}
            className={cn(
              "px-2 pb-2 text-xs",
              published.reason === "no-address" ? "text-muted-foreground" : "text-warning",
            )}
          >
            {published.reason === "no-address" ? t.content.collected.testsOnly : published.error}
          </p>
        ) : null}
        {error && (
          <p data-testid="collected-error" className="px-2 pb-2 text-xs text-destructive">
            {error}
          </p>
        )}
        {note && (
          <p data-testid="collected-note" className="px-2 pb-2 text-xs text-muted-foreground">
            {note}
          </p>
        )}
        {rows.length === 0 && published && (
          <p className="px-2 py-2 text-sm text-muted-foreground">{t.content.collected.none}</p>
        )}
        <ul data-testid="records">
          {rows.map((row) => {
            const pending = row.kind === "published" ? row.record.status === "pending" : !!row.record.pending;
            const title =
              row.kind === "test"
                ? row.record.title
                : String((titleField && row.record.fields[titleField]) || "") || t.content.collected.noTitle;
            return (
              <li
                key={`${row.kind}:${row.id}`}
                data-testid="record"
                data-id={row.id}
                data-kind={row.kind}
                data-pending={pending || undefined}
                className="group rounded-md pr-1 hover:bg-accent"
              >
                <div className="flex items-center gap-1">
                  {/* A test record's tip also says what its Test badge means. */}
                  <Tip
                    text={
                      row.kind === "test"
                        ? t.content.collected.openTest
                        : open === row.id
                          ? t.content.collected.hideSent
                          : t.content.collected.showSent
                    }
                  >
                    <button
                      type="button"
                      onClick={() =>
                        row.kind === "test" ? onOpen(row.id) : setOpen((o) => (o === row.id ? undefined : row.id))
                      }
                      className="flex min-w-0 flex-1 items-center gap-2 py-2 pl-2 text-left text-sm"
                    >
                      <span className={cn("truncate", row.kind === "test" && row.record.skipped && "line-through")}>
                        {title}
                      </span>
                      {row.kind === "test" && (
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {t.content.collected.test}
                        </span>
                      )}
                      {pending && (
                        <span className="shrink-0 rounded bg-warning-muted px-1.5 py-0.5 text-[10px] font-medium text-warning">
                          {t.content.collected.pending}
                        </span>
                      )}
                      {row.kind === "test" && row.record.problems.length > 0 && (
                        <AlertTriangle
                          className="size-3.5 shrink-0 text-warning"
                          aria-label={row.record.problems.join("; ")}
                        />
                      )}
                      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{when(row.submitted)}</span>
                    </button>
                  </Tip>
                  {row.kind === "published" && pending && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      tip={t.content.collected.approveTip}
                      data-testid="record-approve"
                      onClick={() => act(() => spaka.invoke("content:approve", ds.name, row.id))}
                    >
                      <Check />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    tip={t.content.deleteTip}
                    data-testid="record-delete"
                    onClick={() => (row.kind === "test" ? onDeleteTest(row.record) : setConfirming(row.id))}
                  >
                    <Trash2 />
                  </Button>
                </div>
                {row.kind === "published" && confirming === row.id && (
                  <div data-testid="record-confirm-delete" className="flex items-center gap-2 px-2 pb-2 text-xs">
                    <span className="text-destructive">{t.content.collected.deleteForGood}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      tip={t.content.collected.deleteForGoodTip}
                      data-testid="record-delete-for-good"
                      onClick={() => {
                        setConfirming(undefined);
                        act(() => spaka.invoke("content:delete-published", ds.name, row.id));
                      }}
                    >
                      {t.content.collected.delete}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      tip={t.content.collected.keepTip}
                      onClick={() => setConfirming(undefined)}
                    >
                      {t.content.collected.cancel}
                    </Button>
                  </div>
                )}
                {row.kind === "published" && open === row.id && (
                  <dl
                    data-testid="published-record"
                    className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-2 pb-2 text-xs"
                  >
                    {ds.fields.map((f) => (
                      <div key={f.name} className="contents">
                        <dt className="font-medium text-muted-foreground">{f.label ?? f.name}</dt>
                        <dd className="whitespace-pre-wrap break-words">
                          {Array.isArray(row.record.fields[f.name])
                            ? (row.record.fields[f.name] as unknown[]).join(", ")
                            : String(row.record.fields[f.name] ?? "")}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            );
          })}
        </ul>
        <Button
          size="sm"
          variant="outline"
          className="mt-4 ml-2"
          tip={t.content.askFieldsTip}
          onClick={() => onAsk(t.content.askFieldsMessage(ds.label))}
        >
          {t.content.askFields}
        </Button>
      </div>
    </>
  );
}
