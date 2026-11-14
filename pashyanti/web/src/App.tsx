/**
 * Pashyanti — one screen: the caller's words, the user's replies, and Sakhi.
 *
 * The call ends on an artefact, not a chat bubble: `end_call` asks the backend
 * for `summary` (#4), and the card replaces the transcript. `new_call` clears
 * everything and hands the screen back to the empty state.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Mascot, type MascotState } from "./components/Mascot";
import { Onboarding } from "./components/Onboarding";
import { SummaryCard } from "./components/SummaryCard";
import { ThemeToggle } from "./components/ThemeToggle";
import type { Line, ServerMsg, Summary } from "./types";
import { useSocket } from "./ws";

const CHIPS = [
  "हाँ, बोलिए।",
  "थोड़ा धीरे बोलिए।",
  "मैं समझ गया।",
  "कृपया दोहराइए।",
  "एक मिनट रुकिए।",
];

const STATUS_LABEL: Record<string, string> = {
  idle: "तैयार",
  listening: "सुन रहे हैं",
  thinking: "सोच रहे हैं",
  speaking: "बोल रहे हैं",
};

/** Server state → mascot face. The mascot is the state indicator, not decoration. */
function face(state: string): MascotState {
  if (state.startsWith("error")) return "unsure";
  if (state === "speaking") return "speaking";
  if (state === "listening") return "listening";
  return "idle";
}

/** How long to wait for #4's summary before saying it did not arrive. */
const SUMMARY_WAIT_MS = 3000;

export default function App() {
  const [lines, setLines] = useState<Line[]>([]);
  const [state, setState] = useState<string>("idle");
  const [mic, setMic] = useState<boolean | null>(null);
  const [draft, setDraft] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [ended, setEnded] = useState(false);
  const [summaryMissing, setSummaryMissing] = useState(false);
  const [tour, setTour] = useState(
    () => new URLSearchParams(location.search).has("tour"),
  );
  const summaryTimer = useRef<number | null>(null);

  const clearSummaryTimer = useCallback(() => {
    if (summaryTimer.current !== null) {
      window.clearTimeout(summaryTimer.current);
      summaryTimer.current = null;
    }
  }, []);

  useEffect(() => clearSummaryTimer, [clearSummaryTimer]);

  const onMsg = useCallback(
    (m: ServerMsg) => {
      switch (m.type) {
        case "hello":
          setMic(m.mic);
          break;
        case "status":
          setState(m.state);
          break;
        case "transcript":
          setLines((prev) => [
            ...prev,
            {
              id: prev.length + 1,
              who: "caller",
              text: m.text,
              lang: m.lang,
              latency_ms: m.latency_ms,
            },
          ]);
          break;
        case "speak":
          setLines((prev) => [
            ...prev,
            { id: prev.length + 1, who: "me", text: m.text },
          ]);
          break;
        case "summary":
          clearSummaryTimer();
          setSummary({
            who: m.who,
            agreed: m.agreed,
            next: m.next,
            turns: m.turns,
            duration_s: m.duration_s,
          });
          setSummaryMissing(false);
          setEnded(true);
          setState("idle");
          break;
        case "error":
          setState(`error: ${m.message}`);
          break;
      }
    },
    [clearSummaryTimer],
  );

  const { connected, send } = useSocket(onMsg);

  const reply = (text: string) => {
    const t = text.trim();
    if (!t) return;
    send({ type: "reply", text: t });
    setDraft("");
  };

  const endCall = () => {
    if (ended) return;
    send({ type: "end_call" });
    setEnded(true);
    setState("idle");
    setSummaryMissing(false);
    clearSummaryTimer();
    summaryTimer.current = window.setTimeout(
      () => setSummaryMissing(true),
      SUMMARY_WAIT_MS,
    );
  };

  const newCall = () => {
    clearSummaryTimer();
    send({ type: "new_call" });
    setLines([]);
    setSummary(null);
    setEnded(false);
    setSummaryMissing(false);
    setDraft("");
    setState("idle");
  };

  const empty = lines.length === 0 && !ended;
  const errored = state.startsWith("error");
  const noMic = mic === false;
  const dotState = !connected || noMic || errored ? "error" : state;
  const statusLabel = !connected
    ? "फिर जुड़ रहे हैं"
    : noMic
      ? "माइक नहीं"
      : errored
        ? "कुछ गड़बड़ है"
        : (STATUS_LABEL[state] ?? "तैयार");

  return (
    <div className="mx-auto flex h-dvh w-full max-w-[430px] flex-col bg-paper text-ink">
      <header className="flex items-center gap-2.5 border-b border-line px-4 py-2">
        <Mascot state={face(state)} size={30} />
        <div className="min-w-0 flex-1">
          <h1 className="wordmark" lang="hi">
            पश्यन्ती
          </h1>
          <p className="wordmark-latin">Pashyanti</p>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="status-pill" role="status" aria-live="polite">
            <span className="status-dot" data-state={dotState} aria-hidden="true" />
            {statusLabel}
          </span>
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setTour(true)}
            aria-label="यह कैसे काम करता है"
            className="icon-btn"
          >
            <span aria-hidden="true" className="text-[17px]">
              ?
            </span>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4">
        {summary ? (
          <SummaryCard summary={summary} />
        ) : ended ? (
          <div className="summary-card anim-in" aria-live="polite">
            <p className="summary-eyebrow">कॉल समाप्त</p>
            <p className="summary-title" lang="hi">
              कॉल खत्म हो गई
            </p>
            <p className="summary-note" lang="hi">
              {summaryMissing
                ? "इस कॉल का सारांश नहीं मिला।"
                : "सारांश आते ही यहाँ दिखेगा।"}
            </p>
          </div>
        ) : empty ? (
          <div className="flex h-full flex-col items-center justify-center px-2 text-center">
            <Mascot state={face(state)} size={112} />
            <h2
              className="mt-6 font-deva text-[26px] leading-[1.35] text-ink"
              lang="hi"
            >
              सामने वाले की बात यहाँ पढ़िए
            </h2>
            <p
              className="mt-3 max-w-[19rem] font-deva text-[18px] leading-relaxed text-muted"
              lang="hi"
            >
              जवाब देने के लिए नीचे कोई चिप दबाइए या अपने शब्द लिखिए।
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5" aria-live="polite">
            {lines.map((l) => (
              <li
                key={l.id}
                className={`bubble ${l.who === "me" ? "bubble-me" : "bubble-caller"}`}
              >
                <p className="bubble-text" lang="hi">
                  {l.text}
                </p>
                {l.who === "caller" && l.latency_ms !== undefined && (
                  <small className="bubble-meta">
                    {l.lang} · {l.latency_ms} ms
                  </small>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>

      <footer className="border-t border-line px-4 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
        {ended ? (
          <button
            type="button"
            className="btn-primary w-full"
            onClick={newCall}
            lang="hi"
          >
            नई कॉल
          </button>
        ) : (
          <>
            {lines.length > 0 && (
              <div className="mb-1.5 flex justify-end">
                <button
                  type="button"
                  className="footer-end"
                  onClick={endCall}
                  lang="hi"
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 16 16"
                    aria-hidden="true"
                  >
                    <rect
                      x="2.5"
                      y="2.5"
                      width="11"
                      height="11"
                      rx="2.5"
                      fill="currentColor"
                    />
                  </svg>
                  कॉल खत्म करें
                </button>
              </div>
            )}

            <div
              className="-mx-1 mb-2.5 flex gap-2 overflow-x-auto px-1 pr-6 [scrollbar-width:none] [mask-image:linear-gradient(to_right,#000_86%,transparent)] [&::-webkit-scrollbar]:hidden"
              aria-label="जल्दी जवाब"
            >
              {CHIPS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => reply(c)}
                  className="chip"
                  lang="hi"
                >
                  {c}
                </button>
              ))}
            </div>

            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                reply(draft);
              }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="अपना जवाब लिखिए…"
                aria-label="अपना जवाब लिखिए"
                lang="hi"
                className="composer-input"
                enterKeyHint="send"
              />
              <button type="submit" className="btn-primary" lang="hi">
                बोलिए
              </button>
            </form>
          </>
        )}
      </footer>

      <Onboarding open={tour} onClose={() => setTour(false)} />
    </div>
  );
}
