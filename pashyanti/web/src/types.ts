export type Summary = {
  who: string;
  agreed: string;
  next: string;
  turns: number;
  duration_s: number;
};

export type ServerMsg =
  | {
      type: "hello";
      models: { stt: string; tts: string };
      mic: boolean;
      /** Present once #5 lands; absent means the switch is not yet wired. */
      phone_line?: boolean;
      /** Present once #6 lands. */
      cloned_voice?: boolean;
    }
  | { type: "transcript"; text: string; lang: string | null; latency_ms: number }
  | { type: "status"; state: "idle" | "listening" | "thinking" | "speaking" }
  | { type: "speak"; text: string; ttfa_ms: number; cached: boolean }
  | ({ type: "summary" } & Summary)
  | { type: "retry" }
  | { type: "phone_line"; enabled: boolean }
  | { type: "cloned_voice"; enabled: boolean }
  | { type: "error"; message: string };

export type ClientMsg =
  | { type: "reply"; text: string }
  | { type: "new_call" }
  | { type: "end_call" }
  | { type: "set_phone_line"; enabled: boolean }
  | { type: "set_cloned_voice"; enabled: boolean };

export type Line = {
  id: number;
  who: "caller" | "me";
  text: string;
  lang?: string | null;
  latency_ms?: number;
};
