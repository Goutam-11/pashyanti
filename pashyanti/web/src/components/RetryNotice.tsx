/**
 * "We didn't catch that" — a system notice, never a caller line.
 *
 * The backend sends `{"type":"retry"}` when a segment is too short or too
 * noisy to trust (#3). Showing nothing reads as a broken app and showing the
 * guess is worse, so the notice sits in the transcript as a distinct card:
 * warm surface, ? badge, no speech metadata. It clears on the next transcript.
 */
export function RetryNotice() {
  return (
    <div className="retry-notice" role="status">
      <span className="retry-badge" aria-hidden="true">
        ?
      </span>
      <div className="min-w-0">
        <p className="retry-hi" lang="hi">
          समझ नहीं आया — दोहराइए
        </p>
        <p className="retry-en">couldn't catch that</p>
      </div>
    </div>
  );
}
