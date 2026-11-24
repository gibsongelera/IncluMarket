"use client";

import { useState } from "react";
import { toast } from "@/lib/toast";

/**
 * Copy one value (an account number) to the clipboard. Named for what it
 * copies; says "Copied" for a moment, and tells the buyer what to do when
 * the browser refuses the clipboard.
 */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn--outline btn--sm"
      aria-label={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          toast(`${label} copied.`, "success");
          window.setTimeout(() => setDone(false), 2000);
        } catch {
          toast("Copying did not work here. Select the number and copy it yourself.", "warning");
        }
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}
