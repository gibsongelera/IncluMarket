"use client";

// Accessible star rating input, ported from ui.starInput.
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
          ★
        </button>
      ))}
    </div>
  );
}
