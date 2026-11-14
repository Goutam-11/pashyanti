/**
 * Sakhi, the myna — one set of paths shared by the state mascot and the logo.
 *
 * A myna is the right animal for this product: it imitates human speech, it is
 * ordinary in every Indian city, and its silhouette (round skull, long beak,
 * amber cheek) survives 30 px where a line-drawn character does not.
 *
 * The mark stays a solid silhouette; state is carried by geometry, never by a
 * new facial expression. See DECISIONS.md D-011.
 */
/** The four states Sakhi can show. Geometry, not expression. */
export type MascotState = "idle" | "listening" | "speaking" | "unsure";

/** Skull and closed beak in one silhouette, drawn on a 100×100 grid. */
export const MYNA_HEAD =
  "M29 26C40 17 55 17 63 27C65.5 30 67 35 68 41L92 49 68 55C62 62 48 65 37 60 26 54 22 36 29 26Z";

/** Closed beak, inset one unit so the silhouette keeps an ink outline. */
export const MYNA_BEAK = "M68 42 90 49 68 54Z";

/** The open beak is two mandibles with an ink gap between them. */
export const MYNA_BEAK_TOP = "M68 41 91 46.5 68 50Z";
export const MYNA_BEAK_BOTTOM = "M68 52 85 57 68 60Z";

/** The myna's amber cheek patch, the one warm note in the mark. */
export const MYNA_CHEEK =
  "M51 34C57 34 60 40 58 45 54 42 50 40 47 40 47 37 49 34 51 34Z";
