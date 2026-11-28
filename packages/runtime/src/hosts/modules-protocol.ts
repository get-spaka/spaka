// What the preview's server process and Spaka say to each other over Node's
// IPC channel (ADR 0014): JSON messages, requests and responses carried as
// plain data, their bodies in base64.
import type { ActionAnswer, ModuleKind } from "../server.ts";

/** A request or a response as it crosses the channel. */
export type WireRequest = { url: string; method: string; headers: [string, string][]; body?: string };
export type WireResponse = { status: number; headers: [string, string][]; body: string };

/** What Spaka asks the process. */
export type HostCall =
  | { id: number; op: "kinds"; name: string }
  | { id: number; op: "load"; name: string; args: Record<string, unknown> }
  | { id: number; op: "action"; name: string; fields: Record<string, string | string[]>; request: WireRequest }
  | { id: number; op: "route"; name: string; request: WireRequest };

/** What the process sends back: an answer, a call of its own to Spaka's data API, or what it says. */
export type HostMessage =
  | { type: "ready"; modules: string[] }
  | { type: "answer"; id: number; value?: unknown; kinds?: ModuleKind[] | null; action?: ActionAnswer }
  | { type: "answer"; id: number; response: WireResponse }
  | { type: "failed"; id: number; message: string }
  | { type: "data"; id: number; call: "list" | "add"; datasource: string; fields?: Record<string, unknown> }
  | { type: "error"; source: string; message: string }
  | { type: "console"; level: "log" | "info" | "warn" | "error" | "debug"; text: string };

/** Spaka's answer to a data call. */
export type DataAnswer = { type: "data"; id: number; value?: unknown; message?: string };

const toBase64 = (bytes: ArrayBuffer) => Buffer.from(bytes).toString("base64");

export async function wireRequest(request: Request): Promise<WireRequest> {
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
  return {
    url: request.url,
    method: request.method,
    headers: [...request.headers],
    ...(body && body.byteLength > 0 ? { body: toBase64(body) } : {}),
  };
}

export function fromWireRequest(wire: WireRequest): Request {
  return new Request(wire.url, {
    method: wire.method,
    headers: wire.headers,
    ...(wire.body !== undefined ? { body: Buffer.from(wire.body, "base64") } : {}),
  });
}

export async function wireResponse(response: Response): Promise<WireResponse> {
  return { status: response.status, headers: [...response.headers], body: toBase64(await response.arrayBuffer()) };
}

export function fromWireResponse(wire: WireResponse): Response {
  const empty = wire.status === 204 || wire.status === 304 || (wire.status >= 100 && wire.status < 200);
  return new Response(empty ? null : Buffer.from(wire.body, "base64"), {
    status: wire.status,
    headers: wire.headers,
  });
}
