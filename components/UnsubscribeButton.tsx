"use client";

import Link from "next/link";
import { useState } from "react";
import { unsubscribeNewsletter } from "@/lib/actions/newsletter";

/** One click to confirm: link scanners in mail systems never press it. */
export function UnsubscribeButton({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  if (state === "done") {
    return (
      <p className="notice notice--success" role="status">
        You are unsubscribed. We will not send you the newsletter again. <Link href="/home">Back to the shop</Link>.
      </p>
    );
  }
  return (
    <>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        className="btn btn--primary"
        disabled={state === "busy"}
        onClick={async () => {
          setState("busy");
          const res = await unsubscribeNewsletter(token);
          if (res.ok) setState("done");
          else {
            setError(res.error || "Could not unsubscribe you.");
            setState("error");
          }
        }}
      >
        {state === "busy" ? "Unsubscribing…" : "Unsubscribe"}
      </button>
    </>
  );
}
