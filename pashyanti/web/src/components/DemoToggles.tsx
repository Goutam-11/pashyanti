/**
 * Two quiet switches for the recording: simulate the phone line, and speak in
 * the cloned voice. They are deliberately not a settings page — a strip under
 * the header, on screen, so a 60-second video can show the same sentence twice.
 *
 * The switch is a real checkbox with role="switch"; the whole label row is the
 * 44 px target, and the visible track is driven by :checked so focus and
 * keyboard work without JavaScript.
 */
export function DemoToggles({
  phoneLine,
  clonedVoice,
  onPhoneLine,
  onVoice,
}: {
  phoneLine: boolean;
  clonedVoice: boolean;
  onPhoneLine: () => void;
  onVoice: () => void;
}) {
  return (
    <div className="toggles" role="group" aria-label="कॉल सेटिंग">
      <label className="switch">
        <span className="switch-text">
          <span className="switch-hi" lang="hi">
            फ़ोन लाइन
          </span>
          <span className="switch-en">Phone line</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={phoneLine}
          onChange={onPhoneLine}
        />
        <span className="switch-track" aria-hidden="true" />
      </label>

      <label className="switch">
        <span className="switch-text">
          <span className="switch-hi" lang="hi">
            मेरी आवाज़
          </span>
          <span className="switch-en">My voice</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={clonedVoice}
          onChange={onVoice}
        />
        <span className="switch-track" aria-hidden="true" />
      </label>
    </div>
  );
}
