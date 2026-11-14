import { useEffect, useState } from "react";
import { Mascot, type MascotState } from "./Mascot";

const STEPS: { hi: string; en: string; body: string; state: MascotState }[] = [
  {
    hi: "ये ऐप आपके लिए सुनता है",
    en: "It listens for you",
    body: "सामने वाले की बात सीधे स्क्रीन पर बड़े अक्षरों में आती है।",
    state: "listening",
  },
  {
    hi: "और आपके लिए बोलता है",
    en: "It speaks for you",
    body: "आप चिप दबाइए या लिखिए — जवाब आवाज़ में सामने वाले को सुनाया जाता है।",
    state: "speaking",
  },
  {
    hi: "शुरू करने के लिए तैयार",
    en: "Ready when you are",
    body: "ज़ोर से बोलिए और रुकिए। जवाब देने के लिए नीचे कोई चिप दबाइए।",
    state: "idle",
  },
];

export function Onboarding({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-paper/95 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
    >
      <div className="anim-in w-full max-w-md rounded-3xl border border-line bg-surface p-6 shadow-sm">
        <div className="mb-4 flex justify-center">
          <Mascot state={s.state} size={96} />
        </div>

        <h2
          id="tour-title"
          className="text-center font-deva text-2xl leading-snug text-ink"
          lang="hi"
        >
          {s.hi}
        </h2>
        <p className="mt-1 text-center text-[11px] uppercase tracking-[0.18em] text-muted">
          {s.en}
        </p>
        <p className="mt-4 text-center font-deva text-lg leading-relaxed text-muted" lang="hi">
          {s.body}
        </p>

        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-2 py-2 text-sm text-muted underline underline-offset-4 hover:text-ink"
          >
            छोड़ दें
          </button>

          <div className="flex items-center gap-1.5" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? "w-5 bg-accent" : "w-1.5 bg-line"
                }`}
              />
            ))}
          </div>

          <button
            onClick={() => (last ? onClose() : setStep(step + 1))}
            className="rounded-xl bg-accent px-5 py-2.5 font-deva text-base font-semibold text-accent-ink"
            lang="hi"
          >
            {last ? "शुरू करें" : "आगे"}
          </button>
        </div>
      </div>
    </div>
  );
}
