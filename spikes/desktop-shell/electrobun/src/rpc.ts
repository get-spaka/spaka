// What the app's interface and the Bun main process say to each other.
import type { RPCSchema } from "electrobun/main";
import type { AgentEvent, AgentResult } from "../../shared/ui/types";

export type SpikeRPC = {
  bun: RPCSchema<{
    requests: {
      info: {
        params: {};
        response: {
          previewUrl: string;
          selftest: string | null;
          versions: Record<string, string>;
          renderer: "native" | "cef";
          previewQuery: string;
        };
      };
      saveCapture: {
        params: { name: string; dataUrl: string };
        response: { file: string; bytes: number };
      };
      agentTurn: { params: { prompt: string }; response: AgentResult };
      // Diagnostic: answers after `ms`, optionally sending `chatter` messages meanwhile.
      sleep: { params: { ms: number; chatter?: number }; response: { slept: number } };
    };
    messages: {
      mark: { name: string };
      report: Record<string, unknown>;
    };
  }>;
  webview: RPCSchema<{
    requests: {};
    messages: {
      agentEvent: AgentEvent;
    };
  }>;
};
