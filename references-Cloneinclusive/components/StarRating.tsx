import * as React from "react";

// Display-only star rating, matches ui.starHtml output (.stars markup + classes).
export function StarRating({ score, max = 5 }: { score: number; max?: number }) {
  const s = Math.max(0, Math.min(max, Math.round(score || 0)));
  return (
    <span className="stars" aria-label={`${s} out of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => {
        const filled = i + 1 <= s;
        return (
          <span
            key={i}
            className={`star ${filled ? "star--filled" : "star--empty"}`}
            aria-hidden="true"
          >
            ★
          </span>
        );
      })}
    </span>
  );
}
