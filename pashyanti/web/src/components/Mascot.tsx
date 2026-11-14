/**
 * Sakhi — the state indicator, never decoration.
 *
 * She is a peacock, traced exactly from the owner's reference tile: head,
 * S-neck, shoulder, five-feather crest, ringed eye and three sound arcs. The
 * eye ring and nostril are holes in the traced geometry, not drawn on top.
 *
 * Arcs are part of the mark at rest (the reference has them); listening makes
 * them pulse. Speaking swaps the closed beak for the designed mandibles;
 * unsure replaces the arcs with the green ? disc, because a badge and the arcs
 * collide at the top of the head.
 */
import { useId } from "react";
import { useI18n } from "../i18n";
import {
  PEACOCK_ARCS,
  PEACOCK_BADGE,
  PEACOCK_BADGE_DOT,
  PEACOCK_BADGE_MARK,
  PEACOCK_BEAK_CLOSED,
  PEACOCK_GAPE,
  PEACOCK_HEAD,
  PEACOCK_PUPIL,
  PEACOCK_SHOULDER,
  type MascotState,
} from "./peacock";

export type { MascotState } from "./peacock";

export function Mascot({
  state = "idle",
  size = 40,
  className = "",
}: {
  state?: MascotState;
  size?: number;
  className?: string;
}) {
  const { m } = useI18n();
  const gapeId = useId();
  const listening = state === "listening";
  const speaking = state === "speaking";
  const unsure = state === "unsure";

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={`${m.mascot.name}, ${m.mascot[state]}`}
    >
      {!unsure && (
        <g
          className={listening ? "anim-ear" : undefined}
          fill="var(--color-accent)"
        >
          {PEACOCK_ARCS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
      )}

      {speaking && (
        <defs>
          <mask
            id={gapeId}
            maskUnits="userSpaceOnUse"
            x="0"
            y="0"
            width="100"
            height="100"
          >
            <rect width="100" height="100" fill="white" />
            <path d={PEACOCK_GAPE} fill="black" />
          </mask>
        </defs>
      )}

      <g fill="var(--color-accent)">
        <path d={PEACOCK_SHOULDER} />
        <path d={PEACOCK_HEAD} />
        <path d={PEACOCK_PUPIL} />
        <path
          d={PEACOCK_BEAK_CLOSED}
          fillRule="evenodd"
          mask={speaking ? `url(#${gapeId})` : undefined}
        />
      </g>

      {unsure && (
        <g>
          <circle
            cx={PEACOCK_BADGE.cx}
            cy={PEACOCK_BADGE.cy}
            r={PEACOCK_BADGE.r}
            fill="var(--color-accent)"
          />
          <path
            d={PEACOCK_BADGE_MARK}
            fill="none"
            stroke="var(--color-primary-ink)"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle
            cx={PEACOCK_BADGE_DOT.cx}
            cy={PEACOCK_BADGE_DOT.cy}
            r={PEACOCK_BADGE_DOT.r}
            fill="var(--color-primary-ink)"
          />
        </g>
      )}
    </svg>
  );
}
