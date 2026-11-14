export type Summary = {
  who: string;
  agreed: string;
  next: string;
  turns: number;
  duration_s: number;
};

export type ServerMsg =
  | { type: "hello"; models: { stt: string; tts: string }; mic: boolean }
  | { type: "transcript"; text: string; lang: string | null; latency_ms: number }
  | { type: "status"; state: "idle" | "listening" | "thinking" | "speaking" }
  | { type: "speak"; text: string; ttfa_ms: number; cached: boolean }
  | ({ type: "summary" } & Summary)
  | { type: "error"; message: string };

export type ClientMsg =
  | { type: "reply"; text: string }
  | { type: "new_call" }
  | { type: "end_call" };

export type Line = {
  id: number;
  who: "caller" | "me";
  text: string;
  lang?: string | null;
  latency_ms?: number;
};
