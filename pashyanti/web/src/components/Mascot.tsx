/**
 * Sakhi — the confidante.
 *
 * In Indian poetics a *sakhi* is the friend who carries your words to the person
 * you cannot reach. That is this product.
 *
 * Her ear doubles as an eye, because Pashyanti is the stage of speech that is
 * *seen* rather than heard.
 *
 * Drawing notes: the ear is drawn first and its inner ends run *under* the head,
 * so the silhouette reads as one creature. Thick strokes so she survives 28 px
 * in the header. Four states, no mouth animation when silent.
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
  // Below 44 px the inner-ear line and the eye read as smudges, not as detail.
  const compact = size < 44;

  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={`Sakhi, ${state}`}
    >
      {/* ear — also the eye. Ends tucked under the head so it looks attached. */}
      <g className={listening ? "anim-ear" : undefined}>
        <path
          d="M40 33C22 33 12 46 14 58c2 12 12 20 26 20 6 0 10-2 12-3V33Z"
          fill="var(--color-accent)"
          fillOpacity="0.22"
          stroke="var(--color-ink)"
          strokeWidth="3.4"
          strokeLinejoin="round"
        />
        {!compact && (
          <>
            {/* inner ear line, so it reads as an ear and not a blob */}
            <path
              d="M40 44c-9 1-15 8-14 16"
              fill="none"
              stroke="var(--color-ink)"
              strokeWidth="2.4"
              strokeLinecap="round"
              opacity="0.55"
            />
            {/* the eye inside the ear */}
            <circle cx="26" cy="52" r="4" fill="var(--color-ink)" />
          </>
        )}
      </g>

      {/* head */}
      <circle
        cx="60"
        cy="50"
        r="24"
        fill="var(--color-surface)"
        stroke="var(--color-ink)"
        strokeWidth="3.4"
      />

      {/* mouth */}
      {speaking ? (
        <ellipse
          className="anim-talk"
          cx="64"
          cy="60"
          rx="6"
          ry="6.5"
          fill="var(--color-accent)"
        />
      ) : (
        <path
          d="M56 59q8 6 16 0"
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="3.4"
          strokeLinecap="round"
        />
      )}

      {state === "unsure" && (
        <text
          x="76"
          y="28"
          fontSize="21"
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
