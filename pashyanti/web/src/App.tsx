import { useCallback, useState } from "react";
import { Mascot, type MascotState } from "./components/Mascot";
import { Onboarding } from "./components/Onboarding";
import { ThemeToggle } from "./components/ThemeToggle";
import type { Line, ServerMsg } from "./types";
import { useSocket } from "./ws";

const CHIPS = [
  "हाँ, बोलिए।",
  "थोड़ा धीरे बोलिए।",
  "मैं समझ गया।",
  "कृपया दोहराइए।",
  "एक मिनट रुकिए।",
];

/** Server state → mascot face. The mascot is the state indicator, not decoration. */
function face(state: string): MascotState {
  if (state.startsWith("error")) return "unsure";
  if (state === "speaking") return "speaking";
  if (state === "listening") return "listening";
  return "idle";
}

export default function App() {
  const [lines, setLines] = useState<Line[]>([]);
  const [state, setState] = useState<string>("idle");
  const [mic, setMic] = useState<boolean | null>(null);
  const [ttfa, setTtfa] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [tour, setTour] = useState(
    () => new URLSearchParams(location.search).has("tour"),
  );

  const onMsg = useCallback((m: ServerMsg) => {
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
        setTtfa(m.ttfa_ms);
        setLines((prev) => [
          ...prev,
          { id: prev.length + 1, who: "me", text: m.text },
        ]);
        break;
      case "error":
        setState(`error: ${m.message}`);
        break;
    }
  }, []);

  const { connected, send } = useSocket(onMsg);

  const reply = (text: string) => {
    const t = text.trim();
    if (!t) return;
    send({ type: "reply", text: t });
    setDraft("");
  };

  const empty = lines.length === 0;

  return (
    <div className="mx-auto flex h-dvh w-full max-w-[430px] flex-col bg-paper text-ink">
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <Mascot state={face(state)} size={30} />
        <div className="min-w-0 flex-1 leading-tight">
          <h1 className="font-deva text-lg text-ink" lang="hi">
            पश्यन्ती
          </h1>
          <p className="text-[9px] uppercase tracking-[0.2em] text-muted">
            Pashyanti
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              connected ? "bg-accent" : "bg-warn"
            }`}
            aria-hidden="true"
          />
          <span className="text-[10px] text-muted">
            {mic === false ? "no mic" : state}
          </span>
          {ttfa !== null && (
            <span className="rounded-full border border-line px-1.5 py-0.5 text-[10px] tabular-nums text-muted">
              {ttfa} ms
            </span>
          )}
          <ThemeToggle />
          <button
            onClick={() => setTour(true)}
            aria-label="How this works"
            className="grid h-8 w-8 place-items-center rounded-full border border-line text-sm text-muted hover:text-ink"
          >
            ?
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Mascot state={face(state)} size={112} className="anim-bob" />
            <p
              className="mt-5 font-deva text-2xl leading-snug text-ink"
              lang="hi"
            >
              बोलिए, मैं सुन रही हूँ
            </p>
            <p className="mt-2 max-w-[16rem] font-deva text-base leading-relaxed text-muted" lang="hi">
              सामने वाले की बात यहाँ दिखेगी। जवाब देने के लिए नीचे कोई चिप दबाइए।
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {lines.map((l) => (
              <li
                key={l.id}
                className={
                  l.who === "me"
                    ? "anim-in ml-auto max-w-[92%] rounded-2xl rounded-br-md border border-accent/25 bg-accent-soft px-3.5 py-2.5"
                    : "anim-in max-w-[92%] rounded-2xl rounded-bl-md border border-line bg-surface px-3.5 py-2.5"
                }
              >
                <p
                  className="font-deva text-[23px] leading-[1.45] text-ink"
                  lang="hi"
                >
                  {l.text}
                </p>
                {l.who === "caller" && l.latency_ms !== undefined && (
                  <small className="mt-1 block text-[10px] tabular-nums text-muted">
                    {l.lang} · {l.latency_ms} ms
                  </small>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>

      <footer className="border-t border-line px-4 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
        <div className="-mx-1 mb-2.5 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {CHIPS.map((c) => (
            <button
              key={c}
              onClick={() => reply(c)}
              className="shrink-0 rounded-full border border-line bg-surface px-3.5 py-2.5 font-deva text-[15px] text-ink active:scale-[0.97]"
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
            lang="hi"
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 py-3 font-deva text-lg text-ink placeholder:text-muted/70"
          />
          <button
            type="submit"
            className="rounded-xl bg-accent px-5 font-deva text-base font-semibold text-accent-ink active:scale-[0.97]"
            lang="hi"
          >
            बोलिए
          </button>
        </form>
      </footer>

      <Onboarding open={tour} onClose={() => setTour(false)} />
    </div>
  );
}
