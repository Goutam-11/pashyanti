import { useCallback, useState } from "react";
import type { Line, ServerMsg } from "./types";
import { useSocket } from "./ws";

const CHIPS = [
  "हाँ, बोलिए।",
  "थोड़ा धीरे बोलिए।",
  "मैं समझ गया।",
  "कृपया दोहराइए।",
  "एक मिनट रुकिए।",
];

export default function App() {
  const [lines, setLines] = useState<Line[]>([]);
  const [state, setState] = useState<string>("idle");
  const [mic, setMic] = useState<boolean | null>(null);
  const [ttfa, setTtfa] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

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

  return (
    <div className="app">
      <header>
        <div className="brand">
          <strong>पश्यन्ती</strong>
          <span>Pashyanti</span>
        </div>
        <div className="pills">
          <span className={connected ? "pill ok" : "pill bad"}>
            {connected ? "connected" : "offline"}
          </span>
          <span className="pill">{state}</span>
          {mic === false && <span className="pill bad">mic unavailable</span>}
          {ttfa !== null && <span className="pill">ttfa {ttfa} ms</span>}
        </div>
      </header>

      <main>
        <ul className="lines">
          {lines.length === 0 && (
            <li className="empty">
              बोलिए… आपकी बात यहाँ दिखेगी।
              <small>Speak — the caller's words appear here.</small>
            </li>
          )}
          {lines.map((l) => (
            <li key={l.id} className={`line ${l.who}`}>
              <p>{l.text}</p>
              {l.who === "caller" && l.latency_ms !== undefined && (
                <small>
                  {l.lang} · {l.latency_ms} ms
                </small>
              )}
            </li>
          ))}
        </ul>
      </main>

      <footer>
        <div className="chips">
          {CHIPS.map((c) => (
            <button key={c} onClick={() => reply(c)} lang="hi">
              {c}
            </button>
          ))}
        </div>
        <form
          className="composer"
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
          />
          <button type="submit">बोलिए</button>
        </form>
      </footer>
    </div>
  );
}
