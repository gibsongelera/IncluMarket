import * as React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faStar } from "@fortawesome/free-solid-svg-icons";

/**
 * Display-only star rating.
 *
 * Uses the FontAwesome solid star. Note this project has the FREE icon
 * packages, so the import is `faStar` from @fortawesome/free-solid-svg-icons —
 * `byPrefixAndName.fas['star']` is the Pro/Kit form and resolves to the same
 * glyph.
 *
 * Colour comes from --star-filled / --star-empty rather than an inline style,
 * so the high-contrast mode can swap it. The bright gold is only 1.43:1 on
 * white, under the 3:1 WCAG 1.4.11 minimum for a meaningful graphic, so
 * .stars gives the filled star a thin darker edge — see styles/components.css.
 *
 * Size is inherited: FontAwesome renders the svg at height 1em, and .stars
 * sets font-size in rem, so stars scale with the 12–24px accessibility
 * toolbar instead of staying frozen at a pixel size.
 */
export function StarRating({ score, max = 5 }: { score: number; max?: number }) {
  const s = Math.max(0, Math.min(max, Math.round(score || 0)));
  return (
    <span className="stars" role="img" aria-label={`${s} out of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => {
        const filled = i + 1 <= s;
        return (
          <FontAwesomeIcon
            key={i}
            icon={faStar}
            className={`star ${filled ? "star--filled" : "star--empty"}`}
            aria-hidden="true"
          />
        );
      })}
    </span>
  );
}
