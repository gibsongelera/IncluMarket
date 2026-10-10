"use client";

// Last resort: an error in the ROOT layout itself. It replaces the whole
// document, so the app's stylesheets are not loaded here — the few styles are
// inline on purpose. Plain words, a retry, and a way home.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: "3rem 1rem",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
          color: "#212529",
          background: "#F5F7FA",
          lineHeight: 1.5,
        }}
      >
        <main style={{ maxWidth: "36rem", margin: "0 auto" }}>
          <h1 style={{ fontSize: "1.75rem" }}>InclusiveMarket is having trouble</h1>
          <p>Something went wrong while loading the site. Please try again in a moment.</p>
          <p>
            <button
              type="button"
              onClick={reset}
              style={{
                font: "inherit",
                fontWeight: 700,
                padding: "0.75rem 1.25rem",
                minHeight: "2.75rem",
                color: "#FFFFFF",
                background: "#0038A8",
                border: 0,
                borderRadius: "0.5rem",
                cursor: "pointer",
              }}
            >
              Try again
            </button>{" "}
            <a href="/home" style={{ color: "#0038A8", fontWeight: 700 }}>
              Go to the shop
            </a>
          </p>
          {error.digest ? <p style={{ color: "#5A6169", fontSize: "0.875rem" }}>Reference code: {error.digest}</p> : null}
        </main>
      </body>
    </html>
  );
}
