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
 * ("3 stars"), and the group is a radiogroup, so the state is conveyed
 * without relying on the colour of the icon.
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
    </div>
  );
}
