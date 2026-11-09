"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faStar } from "@fortawesome/free-solid-svg-icons";

/**
 * Accessible star rating input.
 *
 * Same FontAwesome solid star as the display component, so a filled star means
 * the same thing whether you are reading a rating or setting one.
 *
 * The glyph is decorative here: each button already carries its own label
 * ("3 stars") and the group is a radiogroup, so screen readers get the
 * state from the radios. Sighted users get it from the "3 of 5" after the
 * stars: chosen and unchosen stars differ only by fill (gold on white is
 * 1.43:1), which WCAG 1.4.1 and 1.4.11 do not accept as the only cue, and
 * Windows forced colours paints all five alike.
 */
export function StarInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="star-input" role="radiogroup" aria-label="Rating from 1 to 5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={n === value}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          // Roving tabindex: the group is one tab stop, arrows move within it.
          tabIndex={n === value || (value < 1 && n === 1) ? 0 : -1}
          className={n <= value ? "is-active" : ""}
          onClick={() => onChange(n)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowUp") {
              e.preventDefault();
              onChange(Math.min(5, value + 1));
            }
            if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
              e.preventDefault();
              onChange(Math.max(1, value - 1));
            }
          }}
        >
          <FontAwesomeIcon icon={faStar} aria-hidden="true" />
        </button>
      ))}
      {/* Hidden from screen readers: the checked radio already says it. */}
      <span className="star-input__value" aria-hidden="true">
        {value >= 1 ? `${value} of 5` : "Not rated"}
      </span>
    </div>
  );
}
