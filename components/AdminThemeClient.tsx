"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { getThemePreset } from "@/lib/theme";
import { applyThemePreset, saveThemeChrome } from "@/lib/actions/theme";

type PresetLite = { id: string; label: string; description: string; swatches: string[] };
type Initial = {
  presetId: string;
  nav: string;
  body: string;
  footer: string;
  hasOverrides: boolean;
};

function normalizeHex(v: string): string | null {
  if (!v) return null;
  v = String(v).trim();
  if (v[0] !== "#") v = "#" + v;
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) return v.toUpperCase();
  if (/^#[0-9A-Fa-f]{3}$/.test(v))
    return ("#" + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]).toUpperCase();
  return null;
}

export function AdminThemeClient({
  initial,
  presets,
}: {
  initial: Initial;
  presets: PresetLite[];
}) {
  const router = useRouter();
  const [nav, setNav] = useState(initial.nav);
  const [body, setBody] = useState(initial.body);
  const [footer, setFooter] = useState(initial.footer);
  const [navHex, setNavHex] = useState(initial.nav);
  const [bodyHex, setBodyHex] = useState(initial.body);
  const [footerHex, setFooterHex] = useState(initial.footer);
  const [activePreset, setActivePreset] = useState(initial.presetId);
  const [hasOverrides, setHasOverrides] = useState(initial.hasOverrides);

  const activeLabel = useMemo(() => {
    const p = getThemePreset(activePreset);
    return `Active preset: ${p.label}${hasOverrides ? " (with custom chrome overrides)" : ""}`;
  }, [activePreset, hasOverrides]);

  function livePreview(next?: { nav?: string; body?: string; footer?: string }) {
    const root = document.documentElement;
    const n = next?.nav ?? nav;
    const b = next?.body ?? body;
    const f = next?.footer ?? footer;
    root.style.setProperty("--color-nav", n);
    root.style.setProperty("--color-body", b);
    root.style.setProperty("--color-body-bg", b);
    root.style.setProperty("--color-footer", f);
  }

  function onPicker(which: "nav" | "body" | "footer", value: string) {
    const v = value.toUpperCase();
    if (which === "nav") {
      setNav(v);
      setNavHex(v);
      livePreview({ nav: v });
    } else if (which === "body") {
      setBody(v);
      setBodyHex(v);
      livePreview({ body: v });
    } else {
      setFooter(v);
      setFooterHex(v);
      livePreview({ footer: v });
    }
  }

  function onHexCommit(which: "nav" | "body" | "footer", raw: string) {
    const h = normalizeHex(raw);
    if (!h) {
      toast("Enter a valid hex color (#RRGGBB).", "warning");
      return;
    }
    onPicker(which, h);
  }

  async function saveChrome() {
    const n = normalizeHex(navHex);
    const b = normalizeHex(bodyHex);
    const f = normalizeHex(footerHex);
    if (!n || !b || !f) {
      toast("All chrome colors must be valid hex values.", "error");
      return;
    }
    const res = await saveThemeChrome(n, b, f);
    if (!res.ok) {
      toast(res.error || "Could not save.", "error");
      return;
    }
    setHasOverrides(true);
    toast("Chrome colors saved. Synced for all roles.", "success");
    router.refresh();
  }

  async function applyPreset(id: string) {
    const res = await applyThemePreset(id);
    if (!res.ok) {
      toast(res.error || "Could not apply preset.", "error");
      return;
    }
    const preset = getThemePreset(id);
    onPicker("nav", (preset.vars["--color-nav"] || "#711402").toUpperCase());
    onPicker("body", (preset.vars["--color-body"] || "#FFFFFF").toUpperCase());
    onPicker("footer", (preset.vars["--color-footer"] || "#2A1A12").toUpperCase());
    setActivePreset(id);
    setHasOverrides(false);
    toast(`Theme applied: ${preset.label}`, "success");
    router.refresh();
  }

  return (
    <>
      <section className="theme-panel" aria-labelledby="chrome-title">
        <h2 id="chrome-title">Site chrome colors</h2>
        <div className="theme-chrome-grid">
          <div className="field">
            <label htmlFor="theme-nav">Navigation / header</label>
            <div className="color-field">
              <input type="color" id="theme-nav" value={nav} onChange={(e) => onPicker("nav", e.target.value)} />
              <input
                type="text"
                id="theme-nav-hex"
                className="color-hex"
                maxLength={7}
                spellCheck={false}
                aria-label="Nav hex"
                value={navHex}
                onChange={(e) => setNavHex(e.target.value)}
                onBlur={(e) => onHexCommit("nav", e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="theme-body">Body background</label>
            <div className="color-field">
              <input type="color" id="theme-body" value={body} onChange={(e) => onPicker("body", e.target.value)} />
              <input
                type="text"
                id="theme-body-hex"
                className="color-hex"
                maxLength={7}
                spellCheck={false}
                aria-label="Body hex"
                value={bodyHex}
                onChange={(e) => setBodyHex(e.target.value)}
                onBlur={(e) => onHexCommit("body", e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="theme-footer">Footer</label>
            <div className="color-field">
              <input type="color" id="theme-footer" value={footer} onChange={(e) => onPicker("footer", e.target.value)} />
              <input
                type="text"
                id="theme-footer-hex"
                className="color-hex"
                maxLength={7}
                spellCheck={false}
                aria-label="Footer hex"
                value={footerHex}
                onChange={(e) => setFooterHex(e.target.value)}
                onBlur={(e) => onHexCommit("footer", e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="theme-actions">
          <button type="button" className="btn btn--primary" id="theme-save" onClick={saveChrome}>
            Save chrome colors
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            id="theme-reset-chrome"
            onClick={() => applyPreset(activePreset)}
          >
            Reset chrome to preset
          </button>
        </div>
      </section>

      <section className="theme-panel" aria-labelledby="palette-title">
        <h2 id="palette-title">Brand palette swatches</h2>
        <p className="muted">Click a swatch row to apply that complementary palette site-wide.</p>
        <div className="theme-swatch-list" id="theme-swatch-list" role="list">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`theme-swatch-row ${activePreset === p.id ? "is-active" : ""}`}
              role="listitem"
              aria-pressed={activePreset === p.id}
              onClick={() => applyPreset(p.id)}
            >
              <span className="theme-swatch-row__dots">
                {p.swatches.map((c, i) => (
                  <span key={i} className="theme-dot" style={{ background: c }} title={c} />
                ))}
              </span>
              <span className="theme-swatch-row__meta">
                <strong>{p.label}</strong>
                <span className="muted small">{p.description}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="theme-panel" aria-labelledby="event-title">
        <h2 id="event-title">Philippine event themes</h2>
        <p className="muted">Each preset is a multi-color complementary system — never a single flat color.</p>
        <div className="theme-event-grid" id="theme-event-grid">
          {presets
            .filter((p) => p.id !== "default")
            .map((p) => (
              <button
                key={p.id}
                type="button"
                className={`theme-event-card ${activePreset === p.id ? "is-active" : ""}`}
                aria-pressed={activePreset === p.id}
                onClick={() => applyPreset(p.id)}
              >
                <span className="theme-event-card__dots">
                  {p.swatches.map((c, i) => (
                    <span key={i} className="theme-dot" style={{ background: c }} />
                  ))}
                </span>
                <strong>{p.label}</strong>
                <span className="muted small">{p.description}</span>
              </button>
            ))}
        </div>
      </section>

      <section className="theme-panel theme-preview" aria-labelledby="preview-title">
        <h2 id="preview-title">Live preview</h2>
        <div className="theme-preview__chrome" aria-hidden="true">
          <div className="theme-preview__nav">Navigation bar</div>
          <div className="theme-preview__body">
            <span className="btn btn--primary btn--sm">Primary</span>
            <span className="btn btn--warning btn--sm">Accent</span>
            <span className="badge badge--blue">Badge</span>
            <span className="pill pill--processing">Status</span>
          </div>
          <div className="theme-preview__footer">Footer</div>
        </div>
        <p className="muted small" id="theme-active-label">
          {activeLabel}
        </p>
      </section>
    </>
  );
}
