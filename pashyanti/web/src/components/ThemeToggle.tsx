import { useEffect, useState } from "react";
import { useI18n } from "../i18n";

const KEY = "pashyanti.theme";

/** Light is the default: this is a reading app for older eyes, in daylight. */
export function ThemeToggle() {
  const { m } = useI18n();
  const [dark, setDark] = useState(() => {
    const forced = new URLSearchParams(location.search).get("theme");
    if (forced === "dark") return true;
    if (forced === "light") return false;
    return localStorage.getItem(KEY) === "dark";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem(KEY, dark ? "dark" : "light");
  }, [dark]);

  return (
    <button
      type="button"
      onClick={() => setDark(!dark)}
      aria-label={dark ? m.header.themeLight : m.header.themeDark}
      className="icon-btn"
    >
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        aria-hidden="true"
      >
        {dark ? (
          <path
            d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        ) : (
          <>
            <circle
              cx="12"
              cy="12"
              r="4.2"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <path
              d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </>
        )}
      </svg>
    </button>
  );
}
