export type Summary = {
  who: string;
  agreed: string;
  next: string;
  turns: number;
  duration_s: number;
};

export type VoiceMode = "default" | "cloned";

/** Where the audio comes from: the server's microphone, or this phone's. */
export type CallMode = "server" | "talk";

export type ServerMsg =
  | {
      type: "hello";
      models: { stt: string; tts: string };
      mic: boolean;
      /** `talk` means the page captures and plays; the server has no device. */
      mode: CallMode;
      /** Which voice this call starts in (#6). */
      voice: VoiceMode;
      /** Whether the microphone stream is degraded like a phone line (#5). */
      phone_line: boolean;
      /** The older toggle shape (#21); mirrors `voice`. */
      cloned_voice?: boolean;
    }
  | { type: "transcript"; text: string; lang: string | null; latency_ms: number }
  | { type: "status"; state: "idle" | "listening" | "thinking" | "speaking" }
  | { type: "speak"; text: string; ttfa_ms: number; cached: boolean; lang?: string }
  | {
      type: "suggest";
      /** Reply chips in the caller's language, direct answer first. */
      chips: string[];
      lang: string | null;
    }
  | {
      type: "audio";
      /** Base64 s16le PCM; empty on the final marker. */
      data: string;
      rate: number;
      final?: boolean;
    }
  | { type: "capture"; state: "ready" | "error" }
  | ({ type: "summary" } & Summary)
  | { type: "retry" }
  | { type: "voice"; mode: VoiceMode }
  | { type: "phone_line"; enabled: boolean }
  | { type: "cloned_voice"; enabled: boolean }
  | { type: "error"; message: string };

export type ClientMsg =
  | { type: "reply"; text: string }
  | { type: "new_call" }
  | { type: "end_call"; lang?: string }
  | { type: "start_capture" }
  | { type: "set_voice"; mode: VoiceMode }
  | { type: "set_phone_line"; enabled: boolean }
  | { type: "set_cloned_voice"; enabled: boolean };

export type Line = {
  id: number;
  who: "caller" | "me";
  text: string;
  lang?: string | null;
  latency_ms?: number;
};
