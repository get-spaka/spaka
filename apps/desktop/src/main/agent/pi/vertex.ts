// Gemini on Vertex AI, with a call's arguments streamed to the live preview
// (Q273, Q280). Vertex sends a tool call in pieces when asked to
// (streamFunctionCallArguments): a first part with the call's name, then the
// pieces of its arguments, each a JSON path and a value, a string coming in
// several pieces. pi-ai 1.5.2 neither asks for these pieces nor reads them: it
// would take each part for a call of its own. So Upstart asks for them, keeps
// them out of what pi-ai reads, and tells the conversation the call as it
// grows, as OpenAI's arrive, with the same events; pi-ai reads the call once
// whole, as before.
//
// Vertex sends a call's arguments in the alphabetical order of their names,
// whatever the order declared: Write's `content` would come before its
// `file_path`, and the preview could not know which file is being written
// until it is done. So the model sees two names changed, Write's `content` as
// `text` and Edit's `new_string` as `replacement`, the path and the text to
// replace coming first; the rest of Upstart sees the usual names.
import {
  type Api,
  type AssistantMessage,
  type AssistantMessageEvent,
  type AssistantMessageEventStream,
  createProvider,
  type Model,
  type SimpleStreamOptions,
  type StreamOptions,
  type ToolCall,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import * as vertexApi from "@earendil-works/pi-ai/api/google-vertex";

/** The key a request carries on the Google Cloud sign-in made with gcloud: none, pi-ai then uses that sign-in. */
export const GCLOUD_SIGN_IN = "<application-default-credentials>";

/** How the maker connected Vertex AI (Q280): a key of its express mode, or gcloud's sign-in and a project. */
export type VertexConfig = { key: string } | { project: string; location: string };

/** The names Vertex sees in place of Upstart's, per tool, so that a call's arguments come in a useful order. */
const RENAMED: Record<string, Record<string, string>> = {
  Write: { content: "text" },
  Edit: { new_string: "replacement" },
};

type Payload = {
  contents?: { parts?: { functionCall?: { name?: string; args?: Record<string, unknown> } }[] }[];
  config?: {
    tools?: { functionDeclarations?: Declaration[] }[];
    toolConfig?: { functionCallingConfig?: Record<string, unknown> };
  };
};
type Declaration = { name?: string; parameters?: Schema; parametersJsonSchema?: Schema };
type Schema = { properties?: Record<string, unknown>; required?: string[]; [key: string]: unknown };

/** The request as Vertex should get it: the arguments streamed, the two names changed, in the tools and in the calls already made. */
export function forVertex(payload: unknown): unknown {
  const p = payload as Payload;
  const tools = p.config?.tools?.map((tool) =>
    tool.functionDeclarations
      ? {
          ...tool,
          functionDeclarations: tool.functionDeclarations.map((d) => {
            const names = RENAMED[d.name ?? ""];
            if (!names) return d;
            return {
              ...d,
              ...(d.parameters ? { parameters: renameSchema(d.parameters, names) } : {}),
              ...(d.parametersJsonSchema ? { parametersJsonSchema: renameSchema(d.parametersJsonSchema, names) } : {}),
            };
          }),
        }
      : tool,
  );
  const declares = !!tools?.some((t) => t.functionDeclarations?.length);
  const contents = p.contents?.map((content) => ({
    ...content,
    parts: content.parts?.map((part) => {
      const names = RENAMED[part.functionCall?.name ?? ""];
      if (!names || !part.functionCall?.args) return part;
      return { ...part, functionCall: { ...part.functionCall, args: renameKeys(part.functionCall.args, names) } };
    }),
  }));
  return {
    ...p,
    ...(contents ? { contents } : {}),
    ...(p.config
      ? {
          config: {
            ...p.config,
            ...(tools ? { tools } : {}),
            ...(declares
              ? {
                  toolConfig: {
                    ...p.config.toolConfig,
                    functionCallingConfig: {
                      ...p.config.toolConfig?.functionCallingConfig,
                      streamFunctionCallArguments: true,
                    },
                  },
                }
              : {}),
          },
        }
      : {}),
  };
}

function renameSchema(schema: Schema, names: Record<string, string>): Schema {
  return {
    ...schema,
    ...(schema.properties ? { properties: renameKeys(schema.properties, names) } : {}),
    ...(schema.required ? { required: schema.required.map((n) => names[n] ?? n) } : {}),
  };
}

function renameKeys(value: Record<string, unknown>, names: Record<string, string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [names[k] ?? k, v]));
}

/** Upstart's names back, in the order the arguments came. */
function upstartNames(tool: string, args: Record<string, unknown>): Record<string, unknown> {
  const names = RENAMED[tool];
  if (!names) return args;
  const back = Object.fromEntries(Object.entries(names).map(([ours, theirs]) => [theirs, ours]));
  return renameKeys(args, back);
}

type Part = {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: {
    id?: string;
    name?: string;
    args?: Record<string, unknown>;
    partialArgs?: PartialArg[];
    willContinue?: boolean;
  };
};
type PartialArg = {
  jsonPath?: string;
  stringValue?: string;
  numberValue?: number;
  boolValue?: boolean;
  nullValue?: string;
  willContinue?: boolean;
};
type Chunk = { candidates?: { content?: { parts?: Part[] } }[] };

type Open = {
  id: string;
  name: string;
  signature?: string;
  index: number;
  args: Record<string, unknown>;
  /** The arguments' JSON told so far; undefined once it can no longer grow by its end. */
  sent: string | undefined;
};

let counter = 0;

/**
 * Follows one reply's stream: takes the pieces of a call out of each chunk
 * before pi-ai reads it, tells the call as it grows, and gives pi-ai the call
 * whole once its last piece has come.
 */
class StreamedCalls {
  private open: Open | undefined;
  /** The reply as pi-ai builds it, known from its first event. */
  private output: AssistantMessage | undefined;
  /** The places of the calls already told: pi-ai's own start and delta for them are left out. */
  private readonly told = new Set<number>();

  constructor(private readonly push: (event: AssistantMessageEvent) => void) {}

  /** What pi-ai pushes: kept, unless it repeats a call already told. */
  pass(event: AssistantMessageEvent): boolean {
    if ("partial" in event && event.partial) this.output ??= event.partial;
    if ((event.type === "toolcall_start" || event.type === "toolcall_delta") && this.told.has(event.contentIndex))
      return false;
    if (event.type === "toolcall_end") this.told.delete(event.contentIndex);
    return true;
  }

  /** A chunk from Vertex, before pi-ai reads it: its pieces of calls are replaced by the calls once whole. */
  read(chunk: unknown) {
    const candidate = (chunk as Chunk).candidates?.[0];
    const parts = candidate?.content?.parts;
    if (!candidate?.content || !parts?.some((p) => p.functionCall)) return;
    const kept: Part[] = [];
    for (const part of parts) {
      const call = part.functionCall;
      const piece = !!call && (call.willContinue || !!call.partialArgs || (!!this.open && !call.name));
      if (!call || !piece) {
        // A call sent whole carries Vertex's names too.
        kept.push(
          call?.name && call.args
            ? { ...part, functionCall: { ...call, args: upstartNames(call.name, call.args) } }
            : part,
        );
        continue;
      }
      if (call.name) {
        if (this.open) kept.push(this.close());
        this.start(call.name, call.id, part.thoughtSignature, kept);
      }
      const open = this.open;
      if (!open) continue;
      for (const arg of call.partialArgs ?? []) apply(open.args, arg);
      this.tell(open, call.partialArgs?.at(-1));
      if (!call.willContinue) kept.push(this.close());
    }
    candidate.content.parts = kept;
  }

  private start(name: string, id: string | undefined, signature: string | undefined, before: Part[]) {
    const index = (this.output?.content.length ?? 0) + newBlocks(this.output, before);
    this.open = { id: id || `${name}_${Date.now()}_v${++counter}`, name, signature, index, args: {}, sent: "" };
    this.told.add(index);
    this.push({ type: "toolcall_start", contentIndex: index, partial: this.partial(this.open) });
  }

  /** The call's arguments told so far, as a JSON text that only grows. */
  private tell(open: Open, last: PartialArg | undefined) {
    if (open.sent === undefined) return;
    const full = JSON.stringify(upstartNames(open.name, open.args));
    // A string still coming stays open; what follows the last value comes with the next one.
    const growing = last?.willContinue && last.stringValue !== undefined;
    const text = growing ? full.replace(/"?[\]}]*$/, "") : full.replace(/[\]}]*$/, "");
    if (!text.startsWith(open.sent)) {
      open.sent = undefined;
      return;
    }
    const delta = text.slice(open.sent.length);
    if (!delta) return;
    open.sent = text;
    this.push({ type: "toolcall_delta", contentIndex: open.index, delta, partial: this.partial(open) });
  }

  /** The call whole, as pi-ai reads a call Vertex sends in one part. */
  private close(): Part {
    const open = this.open!;
    this.open = undefined;
    // The arguments' JSON told to its end, as a call streamed by OpenAI is.
    const full = JSON.stringify(upstartNames(open.name, open.args));
    if (open.sent !== undefined && full.startsWith(open.sent) && full.length > open.sent.length)
      this.push({
        type: "toolcall_delta",
        contentIndex: open.index,
        delta: full.slice(open.sent.length),
        partial: this.partial(open),
      });
    return {
      functionCall: { id: open.id, name: open.name, args: upstartNames(open.name, open.args) },
      ...(open.signature ? { thoughtSignature: open.signature } : {}),
    };
  }

  /** The reply with the call under way at its place, for the conversation. */
  private partial(open: Open): AssistantMessage {
    const output = this.output ?? ({ content: [] } as unknown as AssistantMessage);
    const content = [...output.content];
    content[open.index] = {
      type: "toolCall",
      id: open.id,
      name: open.name,
      arguments: upstartNames(open.name, open.args) as ToolCall["arguments"],
    };
    return { ...output, content };
  }
}

/**
 * How many blocks pi-ai adds for the parts of a chunk before a call, as it
 * does: a text or a thought opens one unless the last one is of its kind; a
 * call is one.
 */
function newBlocks(output: AssistantMessage | undefined, before: Part[]): number {
  const last = output?.content.at(-1)?.type;
  let kind: string | undefined = last === "text" || last === "thinking" ? last : undefined;
  let added = 0;
  for (const part of before) {
    if (part.functionCall) {
      added++;
      kind = undefined;
    } else if (part.text !== undefined) {
      const k = part.thought ? "thinking" : "text";
      if (k !== kind) added++;
      kind = k;
    }
  }
  return added;
}

/** One piece of an argument, at its JSON path: a string is added to, another value set. */
function apply(args: Record<string, unknown>, arg: PartialArg) {
  const path = parsePath(arg.jsonPath);
  if (!path.length) return;
  let at: Record<string | number, unknown> = args;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!;
    if (at[key] === undefined || typeof at[key] !== "object" || at[key] === null)
      at[key] = typeof path[i + 1] === "number" ? [] : {};
    at = at[key] as Record<string | number, unknown>;
  }
  const key = path.at(-1)!;
  if (arg.stringValue !== undefined) at[key] = (typeof at[key] === "string" ? at[key] : "") + arg.stringValue;
  else if (arg.numberValue !== undefined) at[key] = arg.numberValue;
  else if (arg.boolValue !== undefined) at[key] = arg.boolValue;
  else if (arg.nullValue !== undefined) at[key] = null;
}

/** "$.a.b[0]['c d']" read as ["a", "b", 0, "c d"]. */
export function parsePath(path: string | undefined): (string | number)[] {
  if (!path?.startsWith("$")) return [];
  const keys: (string | number)[] = [];
  const re = /\.([^.[\]]+)|\[(\d+)\]|\['((?:[^'\\]|\\.)*)'\]|\["((?:[^"\\]|\\.)*)"\]/g;
  for (const m of path.slice(1).matchAll(re)) keys.push(m[2] !== undefined ? Number(m[2]) : (m[1] ?? m[3] ?? m[4])!);
  return keys;
}

/** Calls pi-ai's Vertex adapter, its call's arguments streamed (see above). */
function streamed(
  run: () => AssistantMessageEventStream,
  set: (hooks: Pick<StreamOptions, "onPayload" | "onProviderStreamEvent">) => void,
  options: StreamOptions | undefined,
): AssistantMessageEventStream {
  let calls: StreamedCalls | undefined;
  set({
    onPayload: async (payload, model) => {
      const ours = forVertex(payload);
      return (await options?.onPayload?.(ours, model)) ?? ours;
    },
    onProviderStreamEvent: async (event, model) => {
      await options?.onProviderStreamEvent?.(event, model);
      calls?.read(event);
    },
  });
  const stream = run();
  const push = stream.push.bind(stream);
  calls = new StreamedCalls(push);
  stream.push = (event) => {
    if (calls!.pass(event)) push(event);
  };
  return stream;
}

/** The environment a request on gcloud's sign-in reads its project and region from. */
function envFor(config: VertexConfig | undefined, env: Record<string, string> | undefined) {
  if (!config || "key" in config) return env;
  return { ...env, GOOGLE_CLOUD_PROJECT: config.project, GOOGLE_CLOUD_LOCATION: config.location };
}

/** Vertex AI as pi-ai's collection knows it, on the maker's express key or gcloud's sign-in (Q280). */
export function vertexProvider(config: () => VertexConfig | undefined, models: Model<Api>[]) {
  const key = () => {
    const c = config();
    return c ? ("key" in c ? c.key : GCLOUD_SIGN_IN) : undefined;
  };
  return createProvider({
    id: "google-vertex",
    name: "Google Vertex AI",
    auth: {
      apiKey: {
        name: "Google Cloud credentials",
        resolve: async () => {
          const k = key();
          return k ? { auth: { apiKey: k } } : undefined;
        },
      },
    },
    models,
    api: {
      stream: (model: Model<Api>, context: TranscriptContext, options?: StreamOptions) => {
        let opts: StreamOptions = { ...options, env: envFor(config(), options?.env) };
        return streamed(
          () => vertexApi.stream(model as Model<"google-vertex">, context, opts),
          (hooks) => {
            opts = { ...opts, ...hooks };
          },
          options,
        );
      },
      streamSimple: (model: Model<Api>, context: TranscriptContext, options?: SimpleStreamOptions) => {
        let opts: SimpleStreamOptions = { ...options, env: envFor(config(), options?.env) };
        return streamed(
          () => vertexApi.streamSimple(model as Model<"google-vertex">, context, opts),
          (hooks) => {
            opts = { ...opts, ...hooks };
          },
          options,
        );
      },
    },
  });
}
