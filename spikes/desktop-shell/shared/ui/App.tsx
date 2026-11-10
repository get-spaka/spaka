// The spike's whole interface, shared by both shells: three columns (sidebar,
// conversation, preview). Throwaway code: it exists to exercise the shell.
import { useCallback, useEffect, useRef, useState } from "react";
import { blocks, blockById } from "../blocks.js";
import { BLOCK_MIME, BLOCK_TEXT_PREFIX } from "../editing/editor.js";
import { defaultAgentPrompt } from "../agent-turn.js";
import type { AgentEvent, PreviewEvent, ShellBridge } from "./types";

type Item =
  | { id: number; kind: "maker" | "agent" | "log"; text: string; detail?: string }
  | { id: number; kind: "image"; text: string; dataUrl: string };

type Piece = { id: string; domAt: number; frameAt?: number };

let nextId = 1;

export function App({ shell }: { shell: ShellBridge }) {
  const [collapsed, setCollapsed] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [mode, setMode] = useState<"edit" | "browse">("edit");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(defaultAgentPrompt(shell.name));
  const [hovering, setHovering] = useState("");
  const [ghost, setGhost] = useState<{ name: string; x: number; y: number } | null>(null);
  // Width given to the preview (the responsive view); null = all the room there is.
  const [width, setWidth] = useState<number | null>(null);
  // A tour bubble the interface draws over the preview, pointing at the page's title.
  const [tour, setTour] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const tourWanted = useRef(false);

  const previewRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pieces = useRef<Piece[]>([]);
  const loaded = useRef<PreviewEvent | null>(null);
  const selftestDone = useRef(false);
  const agentItem = useRef<number | null>(null);
  const tap = useRef<((event: PreviewEvent) => void) | null>(null);

  const push = useCallback((item: Omit<Item, "id">) => {
    const id = nextId++;
    setItems((list) => [...list, { ...item, id } as Item]);
    return id;
  }, []);
  const log = useCallback((text: string, detail?: string) => push({ kind: "log", text, detail }), [push]);

  // --- self-test: the same checks in both shells ---------------------------
  const runSelftest = useCallback(async () => {
    if (!shell.selftest || selftestDone.current) return;
    selftestDone.current = true;
    // "wait": give pieces that are pushed after the page's load event time to arrive.
    if (shell.selftest.includes("wait")) await new Promise((r) => setTimeout(r, 6000));
    const result: Record<string, unknown> = {
      shell: shell.name,
      versions: shell.versions,
      loaded: loaded.current,
      pieces: pieces.current,
    };
    if (shell.selftest.includes("capture")) {
      const captures: Record<string, unknown> = {};
      for (const how of shell.captureMethods) {
        const capture = await shell.capturePreview(how);
        captures[how] = { ...capture, dataUrl: capture.dataUrl ? `${capture.dataUrl.length} chars` : undefined };
      }
      result.captures = captures;
    }
    if (shell.selftest.includes("interact")) {
      // The editing script's behaviours, driven by hand-built events, then the
      // pointer-relayed drop, then real input where the shell can inject it.
      const seen: PreviewEvent[] = [];
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      tap.current = (event) => {
        if (event.type !== "piece" && event.type !== "piece-frame") seen.push(event);
      };
      shell.sendToPreview({ type: "self-check" });
      await wait(1200);
      shell.sendToPreview({ type: "drag-over", x: 200, y: 300 });
      shell.sendToPreview({ type: "drop-at", x: 200, y: 300, blockId: "faq" });
      await wait(1200);
      tap.current = null;
      result.interact = seen.map((e) => ({
        type: e.type,
        tag: e.element?.tag,
        highlightDrawn: e.highlightDrawn,
        before: e.before,
        after: e.after,
        via: e.via,
        blockId: e.blockId,
        index: e.index,
        carriedAs: e.carriedAs,
        sections: e.sections,
        becameEditable: e.becameEditable,
        dragError: e.dragError,
      }));
      if (shell.protocolDrag) result.protocolDrag = await shell.protocolDrag();
      if (shell.realInput) result.realInput = await shell.realInput();
      shell.mark("selftest-interact-done");
    }
    if (shell.selftest.includes("agent")) {
      shell.mark("selftest-agent-started");
      try {
        result.agent = await shell.agentTurn(defaultAgentPrompt(shell.name));
        shell.mark("selftest-agent-returned");
      } catch (error) {
        result.agent = { ok: false, error: `the interface never got the result: ${String(error)}` };
        shell.mark("selftest-agent-threw");
      }
    }
    shell.report(result);
  }, [shell]);

  // --- events from the preview's editing script ----------------------------
  useEffect(() => {
    shell.onPreviewEvent((event) => {
      tap.current?.(event);
      switch (event.type) {
        case "editor-ready":
          pieces.current = [];
          loaded.current = null;
          log("Editing script injected into the preview", event.href);
          break;
        case "piece":
          pieces.current.push({ id: event.id, domAt: event.domAt });
          break;
        case "piece-frame": {
          const piece = pieces.current.find((p) => p.id === event.id);
          if (piece) piece.frameAt = event.frameAt;
          break;
        }
        case "loaded": {
          loaded.current = event;
          shell.mark("preview-loaded");
          const arrivals = pieces.current
            .map((p) => `${p.id} ${p.domAt} ms${p.frameAt != null ? ` (frame ${p.frameAt})` : ""}`)
            .join(" · ");
          log(
            `Page complete at ${event.loadAt} ms — pieces arrived at: ${arrivals}`,
            `paint entries: ${JSON.stringify(event.paint)} · page ${event.visibility}\n` +
              `editing script sees the page's global: ${event.probes.editorSeesPageGlobal}\n` +
              `editing script sees the page's prototype patch: ${event.probes.editorSeesPagePrototypePatch}\n` +
              `${event.probes.pageSaid}\n${event.userAgent}`,
          );
          void runSelftest();
          break;
        }
        case "hover":
          setHovering(`${event.element.tag}${event.element.piece ? ` in ${event.element.piece}` : ""}`);
          break;
        case "click":
          log(`Clicked <${event.element.tag}> “${event.element.text}”`, event.element.selector);
          break;
        case "text-edit-started":
          log(`Editing the text of <${event.element.tag}> in place…`);
          break;
        case "text-edited":
          log(`Text edited: “${event.before}” → “${event.after}”`, event.element.selector);
          break;
        case "drag-entered":
          log("A dragged block entered the preview", `types seen by the preview: ${event.types.join(", ")}`);
          break;
        case "drop": {
          const block = blockById(event.blockId);
          log(
            `Dropped “${block?.name ?? event.blockId}” at position ${event.index} (${event.via})`,
            event.carriedAs ? `carried as ${event.carriedAs}; types: ${(event.types ?? []).join(", ")}` : undefined,
          );
          if (block) {
            shell.sendToPreview({ type: "insert-block", index: event.index, html: block.html, blockId: block.id });
          }
          break;
        }
        case "inserted":
          log(`Block inserted; the page now has ${event.sections} sections`);
          break;
        case "located":
          // The editing script says where an element is inside the preview;
          // the interface adds where the preview is inside the window.
          if (tourWanted.current && event.rect && previewRef.current) {
            tourWanted.current = false;
            const p = previewRef.current.getBoundingClientRect();
            const anchor = { x: p.left + event.rect.x, y: p.top + event.rect.y, w: event.rect.width, h: event.rect.height };
            if (shell.overlayBubble) shell.overlayBubble(anchor, true);
            else setTour(anchor);
          }
          break;
      }
    });
    shell.onAgentEvent((event: AgentEvent) => {
      const id = agentItem.current;
      if (id === null) return;
      setItems((list) =>
        list.map((item) => {
          if (item.id !== id || item.kind !== "agent") return item;
          if (event.type === "text") return { ...item, text: item.text + event.delta };
          if (event.type === "tool") return { ...item, detail: `${item.detail ?? ""}tool: ${event.name}\n` };
          if (event.type === "init")
            return { ...item, detail: `model ${event.model} · binary ${event.claudeCodeVersion} · key source: ${event.apiKeySource}\n` };
          return item;
        }),
      );
    });
    // Two marks: the interface exists, then the engine has drawn a frame of it
    // (the second only comes while the window is actually being displayed).
    shell.mark("ui-mounted");
    requestAnimationFrame(() => shell.mark("ui-painted"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (previewRef.current) shell.mountPreview(previewRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [items]);

  // --- actions --------------------------------------------------------------
  const sendPrompt = async () => {
    const prompt = draft.trim();
    if (!prompt || busy) return;
    setBusy(true);
    push({ kind: "maker", text: prompt });
    agentItem.current = push({ kind: "agent", text: "", detail: "" });
    const result = await shell.agentTurn(prompt);
    const id = agentItem.current;
    agentItem.current = null;
    setItems((list) =>
      list.map((item) =>
        item.id === id && item.kind === "agent"
          ? {
              ...item,
              text: result.ok ? result.text || item.text : `The turn failed: ${result.error ?? result.subtype}`,
              detail:
                `${item.detail ?? ""}${result.ok ? "completed" : "failed"} in ${result.durationMs} ms` +
                (result.firstTextMs != null ? ` · first text at ${result.firstTextMs} ms` : "") +
                (result.stderr ? `\n${result.stderr}` : ""),
            }
          : item,
      ),
    );
    setBusy(false);
  };

  const capture = async () => {
    const result = await shell.capturePreview();
    if (result.ok && result.dataUrl) {
      push({
        kind: "image",
        text: `Preview captured: ${result.width}×${result.height}, ${result.ms} ms — ${result.method}`,
        dataUrl: result.dataUrl,
      });
    } else {
      log(`Capture failed — ${result.method}`, result.error);
    }
  };

  const toggleTour = () => {
    if (tour) return setTour(null);
    tourWanted.current = true;
    shell.sendToPreview({ type: "locate", selector: "h1" });
  };

  const changeMode = (next: "edit" | "browse") => {
    setMode(next);
    shell.sendToPreview({ type: "set-mode", mode: next });
  };

  // Pointer-based drag: the fallback for a shell where a native drag does not
  // cross from this interface into the preview.
  const startPointerDrag = (e: React.PointerEvent<HTMLButtonElement>, blockId: string, name: string) => {
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const where = (ev: PointerEvent) => {
      const r = previewRef.current!.getBoundingClientRect();
      const inside = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      return { inside, x: ev.clientX - r.left, y: ev.clientY - r.top };
    };
    const move = (ev: PointerEvent) => {
      setGhost({ name, x: ev.clientX, y: ev.clientY });
      const at = where(ev);
      shell.sendToPreview(at.inside ? { type: "drag-over", x: at.x, y: at.y } : { type: "drag-end" });
    };
    const up = (ev: PointerEvent) => {
      handle.removeEventListener("pointermove", move);
      setGhost(null);
      const at = where(ev);
      shell.sendToPreview(at.inside ? { type: "drop-at", x: at.x, y: at.y, blockId } : { type: "drag-end" });
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up, { once: true });
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-100 text-sm text-zinc-900">
      {/* Sidebar */}
      <aside
        data-testid="sidebar"
        className={`flex shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 transition-[width] ${collapsed ? "w-12" : "w-60"}`}
      >
        <div className="flex h-11 items-center justify-between border-b border-zinc-200 px-3">
          {!collapsed && <span className="font-semibold">Upstart spike</span>}
          <button
            className="rounded px-1.5 py-0.5 hover:bg-zinc-200"
            title="Collapse the sidebar"
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>
        {!collapsed && (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <h2 className="px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Projects</h2>
            <ul className="px-2 py-1">
              <li className="rounded bg-zinc-200 px-2 py-1 font-medium">Fernweh launch page</li>
              <li className="rounded px-2 py-1 text-zinc-600">Atelier Lune</li>
              <li className="rounded px-2 py-1 text-zinc-600">Reading list</li>
            </ul>
            <h2 className="px-3 pt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">Gallery</h2>
            <p className="px-3 pb-1 text-xs text-zinc-500">Drag a block into the preview.</p>
            <ul className="space-y-2 px-2 py-1">
              {blocks.map((block) => (
                <li
                  key={block.id}
                  data-block={block.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(BLOCK_MIME, block.id);
                    e.dataTransfer.setData("text/plain", BLOCK_TEXT_PREFIX + block.id);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  className="cursor-grab rounded-md border border-zinc-300 bg-white p-2 shadow-sm active:cursor-grabbing"
                >
                  <div className="font-medium">{block.name}</div>
                  <div className="text-xs text-zinc-500">{block.hint}</div>
                  <button
                    data-pointer-drag={block.id}
                    className="mt-1 cursor-grab touch-none rounded border border-dashed border-zinc-300 px-1.5 text-[11px] text-zinc-500"
                    title="Fallback: the app follows the pointer and tells the preview where it is"
                    onPointerDown={(e) => startPointerDrag(e, block.id, block.name)}
                    // Without this the press also starts a native drag of the
                    // draggable block around the handle, which cancels the pointer.
                    onMouseDown={(e) => e.preventDefault()}
                    draggable={false}
                    onDragStart={(e) => e.preventDefault()}
                  >
                    ⠿ pointer drag
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-auto space-y-0.5 border-t border-zinc-200 p-3 font-mono text-[11px] text-zinc-500">
              <div className="font-sans font-semibold text-zinc-700">{shell.name}</div>
              {shell.embedding && <div>preview: {shell.embedding}</div>}
              {Object.entries(shell.versions).map(([key, value]) => (
                <div key={key}>
                  {key} {value}
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* Conversation */}
      <section data-testid="conversation" className="flex w-[400px] shrink-0 flex-col border-r border-zinc-200 bg-white">
        <div className="flex h-11 items-center border-b border-zinc-200 px-4 font-semibold">Conversation</div>
        <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {items.length === 0 && <p className="text-zinc-400">Events from the preview and the agent's replies appear here.</p>}
          {items.map((item) =>
            item.kind === "image" ? (
              <figure key={item.id} className="rounded-md border border-zinc-200 p-2">
                <img src={item.dataUrl} alt="Capture of the preview" className="w-full rounded" />
                <figcaption className="mt-1 text-xs text-zinc-500">{item.text}</figcaption>
              </figure>
            ) : (
              <div
                key={item.id}
                data-kind={item.kind}
                className={
                  item.kind === "maker"
                    ? "ml-8 rounded-lg bg-blue-600 px-3 py-2 text-white"
                    : item.kind === "agent"
                      ? "mr-8 rounded-lg bg-zinc-100 px-3 py-2"
                      : "border-l-2 border-amber-400 pl-2 text-xs text-zinc-600"
                }
              >
                <div className="whitespace-pre-wrap break-words">{item.text || (item.kind === "agent" ? "…" : "")}</div>
                {item.detail && (
                  <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[10px] opacity-70">{item.detail}</pre>
                )}
              </div>
            ),
          )}
        </div>
        <div className="border-t border-zinc-200 p-3">
          <textarea
            className="h-20 w-full resize-none rounded-md border border-zinc-300 p-2 outline-none focus:border-blue-500"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            data-testid="send"
            className="mt-2 w-full rounded-md bg-zinc-900 py-1.5 font-medium text-white disabled:opacity-40"
            disabled={busy}
            onClick={sendPrompt}
          >
            {busy ? "The agent is working…" : "Send to the agent"}
          </button>
        </div>
      </section>

      {/* Preview */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 items-center gap-2 overflow-hidden whitespace-nowrap border-b border-zinc-200 bg-white px-3">
          <span className="font-semibold">Preview</span>
          {shell.embedding && (
            <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-600">{shell.embedding}</span>
          )}
          <span className="min-w-0 flex-1 truncate text-xs text-zinc-500" title={shell.previewUrl}>
            {hovering ? `under the pointer: ${hovering}` : shell.previewUrl}
          </span>
          <button className="rounded border border-zinc-300 px-2 py-0.5" onClick={() => shell.loadPreview(`${shell.previewUrl}?delay=90`)}>
            Replay
          </button>
          <button className="rounded border border-zinc-300 px-2 py-0.5" onClick={() => shell.loadPreview(`${shell.previewUrl}?mode=push&delay=60`)}>
            Push
          </button>
          <button data-testid="capture" className="rounded border border-zinc-300 px-2 py-0.5" onClick={capture}>
            Capture
          </button>
          <button
            data-testid="tour-toggle"
            className="rounded border border-zinc-300 px-2 py-0.5"
            title="The interface draws a bubble over the preview"
            onMouseDown={(e) => e.preventDefault()}
            onClick={toggleTour}
          >
            Tour tip
          </button>
          {shell.overlayBubble && (
            <button
              data-testid="menu-toggle"
              className="rounded border border-zinc-300 px-2 py-0.5"
              title="A box that starts in the interface and overlaps the preview"
              // Keeps the keyboard where it is (the conversation's text box, say).
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                shell.overlayBubble!({ x: r.left, y: r.top, w: r.width, h: r.height }, false);
              }}
            >
              Menu
            </button>
          )}
          <div className="flex overflow-hidden rounded border border-zinc-300">
            {([null, 768, 390] as const).map((w) => (
              <button
                key={String(w)}
                data-width={w ?? "full"}
                className={`px-2 py-0.5 ${width === w ? "bg-zinc-900 text-white" : ""}`}
                onClick={() => setWidth(w)}
              >
                {w ?? "Full"}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded border border-zinc-300">
            {(["edit", "browse"] as const).map((m) => (
              <button
                key={m}
                className={`px-2 py-0.5 ${mode === m ? "bg-zinc-900 text-white" : ""}`}
                onClick={() => changeMode(m)}
              >
                {m === "edit" ? "Edit" : "Browse"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex min-h-0 flex-1 justify-center bg-zinc-200">
          <div ref={previewRef} data-testid="preview" className="h-full bg-white" style={{ width: width ?? "100%" }} />
        </div>
      </section>

      {tour && (
        <div data-testid="tour" className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setTour(null)} />
          <div
            className="pointer-events-none absolute rounded-md ring-4 ring-amber-400"
            style={{ left: tour.x - 6, top: tour.y - 6, width: tour.w + 12, height: tour.h + 12 }}
          />
          <div
            data-testid="tour-tip"
            className="absolute w-72 rounded-lg bg-white p-3 shadow-2xl"
            style={{ left: tour.x, top: tour.y + tour.h + 16 }}
          >
            <div className="font-semibold">This is the page's title</div>
            <p className="mt-1 text-xs text-zinc-600">
              Double-click a text to edit it in place. This bubble and the dimming are drawn by the app's interface, over
              the preview.
            </p>
            <button
              data-testid="tour-ok"
              className="mt-2 rounded bg-zinc-900 px-2 py-1 text-xs font-medium text-white"
              onClick={() => setTour(null)}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {ghost && (
        <div
          data-testid="drag-ghost"
          className="pointer-events-none fixed z-50 rounded-md border border-orange-400 bg-white px-2 py-1 text-xs shadow-lg"
          style={{ left: ghost.x + 10, top: ghost.y + 10 }}
        >
          {ghost.name}
        </div>
      )}
    </div>
  );
}
