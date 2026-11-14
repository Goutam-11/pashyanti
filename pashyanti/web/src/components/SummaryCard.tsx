/**
 * The end-of-call card.
 *
 * The fields come from the backend (#4): `who` is the first caller line
 * shortened to ~60 characters, `agreed` the last caller line, `next` the last
 * reply we spoke. The card is the demo's payoff frame, so it stays inside one
 * 4:5 screen: the title clamps to three lines and the two rows to three each.
 */
import type { Summary } from "../types";

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
}

export function SummaryCard({ summary }: { summary: Summary }) {
  return (
    <section
      className="summary-card anim-in"
      aria-labelledby="summary-title"
      aria-live="polite"
    >
      <p className="summary-eyebrow">कॉल का सारांश</p>
      <h2 id="summary-title" className="summary-title" lang="hi">
        {summary.who}
      </h2>

      <div className="summary-rule" role="presentation" />

      <dl>
        <div className="summary-row">
          <dt className="summary-label" lang="hi">
            सहमति
          </dt>
          <dd className="summary-value" lang="hi">
            {summary.agreed}
          </dd>
        </div>
        <div className="summary-row">
          <dt className="summary-label" lang="hi">
            आगे
          </dt>
          <dd className="summary-value" lang="hi">
            {summary.next}
          </dd>
        </div>
      </dl>

      <p className="summary-meta">
        {summary.turns} turns · {formatDuration(summary.duration_s)}
      </p>
    </section>
  );
}
