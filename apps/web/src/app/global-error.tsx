"use client";

import * as React from "react";

// Catches errors thrown by the root layout itself (rare) — everything else is
// caught by the closer error.tsx boundaries in (dashboard)/(platform)/operator.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[global error]", error.digest || error.message, error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 420, textAlign: "center" }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
              The app hit an unexpected error. Reloading usually fixes it.
            </p>
            {error.digest && (
              <p style={{ fontSize: 11, fontFamily: "monospace", color: "#94a3b8", marginBottom: 16 }}>
                Reference: {error.digest}
              </p>
            )}
            <button
              onClick={() => reset()}
              style={{
                height: 36,
                padding: "0 16px",
                borderRadius: 12,
                background: "#161622",
                color: "white",
                fontSize: 12,
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
