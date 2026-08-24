"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { flashVisualAlert } from "./VisualAlert";
import {
  A11Y_KEYS,
  FONT_SIZES,
  type FontSizePx,
  applyFontSizePx,
  applyHighContrast,
  applyLargeCursors,
  applyReadingMode,
  applyReduceMotion,
  matchVoiceCommand,
  nextFontSize,
  parseStoredFontSize,
} from "@/lib/a11y/prefs";

type TabId = "display" | "speech" | "voice" | "help";

function speakText(text: string, rate: number) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = rate;
  window.speechSynthesis.speak(u);
}

function stopSpeaking() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
}

export function AccessibilityWidget() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabId>("display");
  const [fontSize, setFontSize] = useState<FontSizePx>(16);
  const [contrast, setContrast] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [largeCursors, setLargeCursors] = useState(false);
  const [visualAlerts, setVisualAlerts] = useState(false);
  const [tts, setTts] = useState(false);
  const [readingMode, setReadingMode] = useState(false);
  const [highlight, setHighlight] = useState(true);
  const [speechRate, setSpeechRate] = useState(1);
  const [voiceCmds, setVoiceCmds] = useState(false);
  const [listening, setListening] = useState(false);
  const [lastCommand, setLastCommand] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const recognitionRef = useRef<{ stop: () => void; start: () => void; onresult: unknown; onend: unknown; onerror: unknown } | null>(null);

  useEffect(() => {
    const ls = window.localStorage;
    const fs = parseStoredFontSize(ls.getItem(A11Y_KEYS.fontSize));
    setFontSize(fs);
    applyFontSizePx(fs);

    const hc = ls.getItem(A11Y_KEYS.contrast) === "true" || document.documentElement.getAttribute("data-contrast") === "high";
    setContrast(hc);
    applyHighContrast(hc);

    const rm = ls.getItem(A11Y_KEYS.reduceMotion) === "true";
    setReduceMotion(rm);
    applyReduceMotion(rm);

    const lc = ls.getItem(A11Y_KEYS.largeCursors) === "true";
    setLargeCursors(lc);
    applyLargeCursors(lc);

    const va = ls.getItem(A11Y_KEYS.visualAlerts) === "true";
    setVisualAlerts(va);

    setTts(ls.getItem(A11Y_KEYS.tts) === "true");
    const reading = ls.getItem(A11Y_KEYS.reading) === "true";
    setReadingMode(reading);
    applyReadingMode(reading);
    setHighlight(ls.getItem(A11Y_KEYS.highlight) !== "false");
    const rate = Number(ls.getItem(A11Y_KEYS.speechRate) || "1");
    setSpeechRate(Number.isFinite(rate) ? rate : 1);
    setVoiceCmds(ls.getItem(A11Y_KEYS.voice) === "true");
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        stopSpeaking();
        setOpen(false);
        fabRef.current?.focus();
      }
      if (e.altKey && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.altKey && e.key === "9") {
        e.preventDefault();
        toggleContrast(!contrast);
      }
      if (e.altKey && e.key === "5") {
        e.preventDefault();
        toggleTts(!tts);
      }
      if (e.altKey && e.key === "4") {
        e.preventDefault();
        stopSpeaking();
      }
      if (e.altKey && e.key === "1" && tts) {
        e.preventDefault();
        speakText(document.title, speechRate);
      }
      if (e.altKey && e.key === "2" && tts) {
        e.preventDefault();
        const text = (document.getElementById("main")?.innerText || "").slice(0, 1200);
        speakText(text || "No main content.", speechRate);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    if (open) {
      document.addEventListener("mousedown", onDocClick);
      panelRef.current?.focus();
    }
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onDocClick);
    };
  }, [open, contrast, tts, speechRate]);

  /**
   * Keep Tab inside the panel while it is open.
   *
   * The panel declares role="dialog" but had no aria-modal and no trap, so Tab
   * walked straight out into the page behind it — leaving a screen reader or
   * keyboard user navigating content they cannot see, with no way back except
   * Shift+Tab counting backwards. Esc and focus-restore-to-FAB already worked;
   * this completes the pattern.
   */
  function trapFocus(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;

    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => el.offsetParent !== null);

    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (e.shiftKey && (active === first || active === panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  useEffect(() => {
    if (!readingMode || !tts) return;
    function onOver(e: MouseEvent) {
      const el = e.target as HTMLElement | null;
      if (!el || el.closest(".a11y-widget")) return;
      const text = (el.innerText || el.getAttribute("aria-label") || "").trim();
      if (!text || text.length > 280) return;
      if (highlight) {
        el.classList.add("a11y-read-highlight");
        window.setTimeout(() => el.classList.remove("a11y-read-highlight"), 900);
      }
      speakText(text.slice(0, 280), speechRate);
    }
    document.addEventListener("mouseover", onOver);
    return () => document.removeEventListener("mouseover", onOver);
  }, [readingMode, tts, highlight, speechRate]);

  useEffect(() => {
    if (!voiceCmds) {
      recognitionRef.current?.stop?.();
      setListening(false);
      return;
    }
    const SR =
      (window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-PH";
    rec.onresult = (event: { results: SpeechRecognitionResultList }) => {
      const last = event.results[event.results.length - 1];
      const said = last?.[0]?.transcript?.trim() || "";
      if (!said) return;
      setLastCommand(said);
      const action = matchVoiceCommand(said);
      if (!action) return;
      if (visualAlerts) flashVisualAlert({ message: `Voice: ${said}`, tone: "info" });
      switch (action.type) {
        case "navigate":
          router.push(action.href);
          break;
        case "speak":
          if (tts) speakText(action.text, speechRate);
          break;
        case "scroll":
          if (action.direction === "top") window.scrollTo({ top: 0, behavior: "smooth" });
          else window.scrollBy({ top: action.direction === "down" ? 400 : -400, behavior: "smooth" });
          break;
        case "focus-search":
          (document.querySelector('input[type="search"], input[name="q"], #search') as HTMLInputElement | null)?.focus();
          break;
        case "stop":
          stopSpeaking();
          break;
        case "back":
          router.back();
          break;
        case "help":
          if (tts)
            speakText(
              "Say go home, go to cart, go to wishlist, read page, scroll down, search, or stop speaking.",
              speechRate
            );
          break;
      }
    };
    rec.onend = () => {
      if (voiceCmds) {
        try {
          rec.start();
          setListening(true);
        } catch {
          setListening(false);
        }
      }
    };
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
    return () => {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
      setListening(false);
    };
  }, [voiceCmds, router, tts, speechRate, visualAlerts]);

  function persist(key: string, value: string) {
    window.localStorage.setItem(key, value);
  }

  function changeFont(delta: number) {
    const next = nextFontSize(fontSize, delta);
    setFontSize(next);
    applyFontSizePx(next);
    persist(A11Y_KEYS.fontSize, String(next));
    if (visualAlerts) flashVisualAlert({ message: `Text size ${next}px`, tone: "info" });
  }

  function setFontExact(px: FontSizePx) {
    setFontSize(px);
    applyFontSizePx(px);
    persist(A11Y_KEYS.fontSize, String(px));
  }

  function toggleContrast(next: boolean) {
    setContrast(next);
    applyHighContrast(next);
    persist(A11Y_KEYS.contrast, String(next));
  }

  function toggleReduceMotion(next: boolean) {
    setReduceMotion(next);
    applyReduceMotion(next);
    persist(A11Y_KEYS.reduceMotion, String(next));
  }

  function toggleLargeCursors(next: boolean) {
    setLargeCursors(next);
    applyLargeCursors(next);
    persist(A11Y_KEYS.largeCursors, String(next));
  }

  function toggleVisualAlerts(next: boolean) {
    setVisualAlerts(next);
    persist(A11Y_KEYS.visualAlerts, String(next));
    if (next) flashVisualAlert({ message: "Visual alerts enabled", tone: "success" });
  }

  function toggleTts(next: boolean) {
    setTts(next);
    persist(A11Y_KEYS.tts, String(next));
    if (!next) stopSpeaking();
    else speakText("Text to speech enabled.", speechRate);
  }

  function toggleReading(next: boolean) {
    setReadingMode(next);
    applyReadingMode(next);
    persist(A11Y_KEYS.reading, String(next));
  }

  function toggleHighlight(next: boolean) {
    setHighlight(next);
    persist(A11Y_KEYS.highlight, String(next));
  }

  function toggleVoice(next: boolean) {
    setVoiceCmds(next);
    persist(A11Y_KEYS.voice, String(next));
  }

  function resetAll() {
    setFontExact(16);
    toggleContrast(false);
    toggleReduceMotion(false);
    toggleLargeCursors(false);
    toggleVisualAlerts(false);
    toggleTts(false);
    toggleReading(false);
    toggleHighlight(true);
    toggleVoice(false);
    setSpeechRate(1);
    persist(A11Y_KEYS.speechRate, "1");
    stopSpeaking();
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "display", label: "Display" },
    { id: "speech", label: "Speech" },
    { id: "voice", label: "Voice" },
    { id: "help", label: "Help" },
  ];

  return (
    <div className="a11y-widget" ref={wrapRef}>
      {open ? (
        <div
          className="a11y-panel a11y-panel--rich"
          role="dialog"
          aria-modal="true"
          aria-label="Accessibility settings"
          ref={panelRef}
          tabIndex={-1}
          onKeyDown={trapFocus}
        >
          <div className="a11y-panel__head">
            <strong>Accessibility</strong>
            <button
              type="button"
              className="icon-btn"
              aria-label="Close accessibility settings"
              onClick={() => {
                setOpen(false);
                fabRef.current?.focus();
              }}
            >
              <Icon name="x" size={16} />
            </button>
          </div>

          <div className="a11y-tabs" role="tablist" aria-label="Accessibility sections">
            {tabs.map((t, i) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`a11y-tab-${t.id}`}
                aria-controls="a11y-tabpanel"
                aria-selected={tab === t.id}
                tabIndex={tab === t.id ? 0 : -1}
                className={`a11y-tab${tab === t.id ? " is-active" : ""}`}
                onClick={() => setTab(t.id)}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                  e.preventDefault();
                  const next =
                    (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
                  setTab(tabs[next].id);
                  const el = document.getElementById(`a11y-tab-${tabs[next].id}`);
                  el?.focus();
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div
            className="a11y-panel__body"
            id="a11y-tabpanel"
            role="tabpanel"
            aria-labelledby={`a11y-tab-${tab}`}
          >
            {tab === "display" ? (
              <>
                <div className="a11y-font-row">
                  <span>Font size</span>
                  <div className="a11y-font-controls">
                    <button type="button" className="btn btn--ghost btn--sm" aria-label="Decrease font size" disabled={fontSize <= 12} onClick={() => changeFont(-2)}>
                      A−
                    </button>
                    <strong aria-live="polite">{fontSize}px</strong>
                    <button type="button" className="btn btn--ghost btn--sm" aria-label="Increase font size" disabled={fontSize >= 24} onClick={() => changeFont(2)}>
                      A+
                    </button>
                  </div>
                </div>
                <div className="a11y-font-presets" role="group" aria-label="Font size presets">
                  {FONT_SIZES.map((px) => (
                    <button
                      key={px}
                      type="button"
                      className={`a11y-font-chip${fontSize === px ? " is-active" : ""}`}
                      aria-pressed={fontSize === px}
                      onClick={() => setFontExact(px)}
                    >
                      {px}
                    </button>
                  ))}
                </div>

                <button type="button" className="a11y-option" aria-pressed={contrast} onClick={() => toggleContrast(!contrast)}>
                  <span>High contrast</span>
                  <span className="a11y-option__state">{contrast ? "On" : "Off"}</span>
                </button>
                <button type="button" className="a11y-option" aria-pressed={reduceMotion} onClick={() => toggleReduceMotion(!reduceMotion)}>
                  <span>Reduce motion</span>
                  <span className="a11y-option__state">{reduceMotion ? "On" : "Off"}</span>
                </button>
                <button type="button" className="a11y-option" aria-pressed={largeCursors} onClick={() => toggleLargeCursors(!largeCursors)}>
                  <span>Large cursor</span>
                  <span className="a11y-option__state">{largeCursors ? "On" : "Off"}</span>
                </button>
                <button type="button" className="a11y-option" aria-pressed={visualAlerts} onClick={() => toggleVisualAlerts(!visualAlerts)}>
                  <span>Visual alert flash</span>
                  <span className="a11y-option__state">{visualAlerts ? "On" : "Off"}</span>
                </button>
              </>
            ) : null}

            {tab === "speech" ? (
              <>
                <button type="button" className="a11y-option" aria-pressed={tts} onClick={() => toggleTts(!tts)}>
                  <span>Text-to-speech</span>
                  <span className="a11y-option__state">{tts ? "On" : "Off"}</span>
                </button>
                {tts ? (
                  <>
                    <label className="a11y-rate">
                      <span>Speech rate ({speechRate.toFixed(1)}x)</span>
                      <input
                        type="range"
                        min={0.5}
                        max={2}
                        step={0.1}
                        value={speechRate}
                        aria-label="Speech rate"
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setSpeechRate(v);
                          persist(A11Y_KEYS.speechRate, String(v));
                        }}
                      />
                    </label>
                    <button type="button" className="a11y-option" aria-pressed={readingMode} onClick={() => toggleReading(!readingMode)}>
                      <span>Reading mode (hover to hear)</span>
                      <span className="a11y-option__state">{readingMode ? "On" : "Off"}</span>
                    </button>
                    {readingMode ? (
                      <button type="button" className="a11y-option" aria-pressed={highlight} onClick={() => toggleHighlight(!highlight)}>
                        <span>Highlight on read</span>
                        <span className="a11y-option__state">{highlight ? "On" : "Off"}</span>
                      </button>
                    ) : null}
                    <div className="a11y-quick">
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => speakText(document.title, speechRate)}>
                        Read title
                      </button>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={stopSpeaking}>
                        Stop
                      </button>
                    </div>
                  </>
                ) : null}
              </>
            ) : null}

            {tab === "voice" ? (
              <>
                <button type="button" className="a11y-option" aria-pressed={voiceCmds} onClick={() => toggleVoice(!voiceCmds)}>
                  <span>Voice commands</span>
                  <span className="a11y-option__state">{voiceCmds ? "On" : "Off"}</span>
                </button>
                {voiceCmds ? (
                  <p className="a11y-hint muted small">
                    {listening ? "Listening…" : "Microphone idle"}
                    {lastCommand ? ` · Last: “${lastCommand}”` : ""}
                    <br />
                    Try “go home”, “go to cart”, “read page”, “scroll down”, “search”.
                  </p>
                ) : (
                  <p className="a11y-hint muted small">Uses the browser speech recognition API when available.</p>
                )}
              </>
            ) : null}

            {tab === "help" ? (
              <div className="a11y-help">
                <p className="small">
                  <strong>Low vision:</strong> enlarge text (12–24px), high contrast, TTS, reading mode, voice navigation.
                </p>
                <p className="small">
                  <strong>Deaf / hard of hearing:</strong> enable visual alert flash for on-screen confirmation of key events.
                </p>
                <p className="small muted">Shortcuts: Alt+A panel · Alt+5 TTS · Alt+9 contrast · Alt+4 stop speech · Esc closes.</p>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() =>
                    speakText(
                      "Accessibility help. Adjust font size, contrast, text to speech, voice commands, and visual alerts from this panel.",
                      speechRate
                    )
                  }
                >
                  Hear this help
                </button>
              </div>
            ) : null}

            <button type="button" className="btn btn--ghost btn--sm a11y-reset" onClick={resetAll}>
              Reset to defaults
            </button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        ref={fabRef}
        className="a11y-fab"
        aria-label={open ? "Close accessibility settings" : "Open accessibility settings"}
        aria-expanded={open}
        title="Accessibility settings (Alt+A)"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="accessibility" size={26} />
      </button>
    </div>
  );
}
