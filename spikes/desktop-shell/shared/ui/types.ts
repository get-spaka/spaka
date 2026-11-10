// The contract between the shared interface and a shell. Each shell builds
// one object of this shape and hands it to `mount()`.

export type PreviewEvent = { type: string; at?: number; [key: string]: any };

export type AgentEvent =
  | { type: "init"; model?: string; claudeCodeVersion?: string; apiKeySource?: string }
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; input: unknown };

export type AgentResult = {
  ok: boolean;
  text?: string;
  error?: string;
  durationMs: number;
  firstTextMs?: number | null;
  tools?: { name: string; input: unknown }[];
  init?: Record<string, unknown> | null;
  stderr?: string;
  subtype?: string | null;
};

export type CaptureResult = {
  ok: boolean;
  /** How the image was obtained, in the shell's own words. */
  method: string;
  dataUrl?: string;
  width?: number;
  height?: number;
  ms?: number;
  file?: string;
  bytes?: number;
  error?: string;
};

export interface ShellBridge {
  name: "electron" | "electrobun";
  /** How the shell embeds the preview, when it has more than one way (shown in the interface). */
  embedding?: string;
  /** Address of the canned page. */
  previewUrl: string;
  versions: Record<string, string>;
  /** Set when the app was launched to test itself: which checks to run. */
  selftest: string | null;

  /** Puts the preview inside `container`, in whatever way the shell embeds web content. */
  mountPreview(container: HTMLElement): void;
  onPreviewEvent(listener: (event: PreviewEvent) => void): void;
  sendToPreview(message: Record<string, unknown>): void;
  loadPreview(url: string): void;
  /** `how` names one of the shell's own capture methods; without it the shell picks. */
  capturePreview(how?: string): Promise<CaptureResult>;
  /**
   * Optional: the shell draws a bubble over the preview by its own means
   * (Electron's overlay-view experiment). `anchor` is in window coordinates;
   * `modal` dims the whole window, otherwise the bubble hangs under the anchor.
   */
  overlayBubble?(anchor: { x: number; y: number; w: number; h: number }, modal: boolean): void;
  /** The capture methods the self-test tries one by one. */
  captureMethods: string[];

  /**
   * Optional: aims real pointer and keyboard input at the preview through the
   * shell's own input injection, and returns what the editing script reported.
   */
  realInput?(): Promise<unknown>;
  /** Optional: a sidebar-to-preview drag driven through the engine's debugging protocol. */
  protocolDrag?(): Promise<unknown>;

  agentTurn(prompt: string): Promise<AgentResult>;
  onAgentEvent(listener: (event: AgentEvent) => void): void;

  /** Timing marks and self-test results, written to disk by the main process. */
  mark(name: string): void;
  report(result: Record<string, unknown>): void;
}
