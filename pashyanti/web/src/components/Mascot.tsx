/**
 * Sakhi — the confidante.
 *
 * In Indian poetics a *sakhi* is the friend who carries your words to the person
 * you cannot reach. That is this product.
 *
 * Her ear doubles as an eye, because the name Pashyanti is the stage of speech
 * that is *seen* rather than heard. Four states, one shape, thick strokes so she
 * still reads at 32 px.
 */
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

  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={`Sakhi, ${state}`}
    >
      {/* ear — also an eye */}
      <g className={listening ? "anim-ear" : undefined}>
        <path
          d="M30 32C14 36 9 54 18 67c5 8 13 10 18 8"
          fill="var(--color-accent-soft)"
          stroke="var(--color-ink)"
          strokeWidth="3.4"
          strokeLinejoin="round"
        />
        <circle cx="22" cy="52" r="3.8" fill="var(--color-ink)" />
      </g>

      {/* head */}
      <circle
        cx="55"
        cy="49"
        r="26"
        fill="var(--color-surface)"
        stroke="var(--color-ink)"
        strokeWidth="3.4"
      />

      {/* mouth */}
      {speaking ? (
        <ellipse
          className="anim-talk"
          cx="59"
          cy="60"
          rx="6.5"
          ry="6"
          fill="var(--color-accent)"
        />
      ) : (
        <path
          d="M51 60q8 6 16 0"
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="3.4"
          strokeLinecap="round"
        />
      )}

      {state === "unsure" && (
        <text
          x="74"
          y="28"
          fontSize="20"
          fontWeight="700"
          fill="var(--color-warn)"
          fontFamily="var(--font-sans)"
        >
          ?
        </text>
      )}
    </svg>
  );
}
