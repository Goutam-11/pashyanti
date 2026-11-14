/**
 * Sakhi — the state indicator, never decoration.
 *
 * In Indian poetics a *sakhi* is the friend who carries your words to the
 * person you cannot reach. Here she is a myna: the bird that imitates speech.
 *
 * Four states, encoded by geometry:
 *   idle      — still, closed beak
 *   listening — an amber ring pulses around her
 *   speaking  — the beak opens and one sound arc leaves it
 *   unsure    — an amber ? badge, for "didn't catch that"
 *
 * The mark is built from three filled shapes (skull, cheek, beak) so it still
 * reads at 30 px in the header. Nothing bobs or blinks when idle, because the
 * mascot is a state readout and motion is a state signal.
 */
import {
  MASCOT_LABEL,
  MYNA_BEAK,
  MYNA_BEAK_BOTTOM,
  MYNA_BEAK_TOP,
  MYNA_CHEEK,
  MYNA_HEAD,
} from "./myna";

export type MascotState = "idle" | "listening" | "speaking" | "unsure";

export function Mascot({
  state = "idle",
  size = 40,
  className = "",
}: {
  state?: MascotState;
  size?: number;
  className?: string;
}) {
  const listening = state === "listening";
  const speaking = state === "speaking";
  const unsure = state === "unsure";
  const detailed = size >= 44;
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={`सखी, ${MASCOT_LABEL[state]}`}
    >
      {listening && (
        <circle
          className="anim-ear"
          cx="52"
          cy="47"
          r="42"
          fill="none"
          stroke="var(--color-accent-text)"
          strokeWidth="3.2"
          opacity="0.9"
        />
      )}

      <path d={MYNA_HEAD} fill="var(--color-ink)" />
      <path d={MYNA_CHEEK} fill="var(--color-accent)" />
      <circle cx="42.5" cy="38" r="4.2" fill="var(--color-paper)" />
      {detailed && (
        <circle cx="43.4" cy="37.1" r="1.7" fill="var(--color-ink)" />
      )}

      {speaking ? (
        <>
          <path d={MYNA_BEAK_TOP} fill="var(--color-accent)" />
          <path
            className="anim-talk"
            d={MYNA_BEAK_BOTTOM}
            fill="var(--color-accent)"
          />
        </>
      ) : (
        <path d={MYNA_BEAK} fill="var(--color-accent)" />
      )}

      {unsure && (
        <g>
          <circle cx="82" cy="22" r="12" fill="var(--color-accent)" />
          <text
            x="82"
            y="28"
            textAnchor="middle"
            fontSize="16"
            fontWeight="700"
            fontFamily="var(--font-sans)"
            fill="var(--color-accent-ink)"
          >
            ?
          </text>
        </g>
      )}
    </svg>
  );
}
