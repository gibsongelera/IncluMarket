"use client";

import { useEffect, useRef, useState } from "react";
import { usePresence } from "@/lib/a11y/use-presence";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { flashVisualAlert } from "./VisualAlert";
import {
  A11Y_KEYS,
  FONT_SIZES,
  type FontSizePx,
  type VoiceSupport,
  applyFontSizePx,
  applyHighContrast,
  applyLargeCursors,
  applyReadingMode,
  applyReduceMotion,
  checkVoiceSupport,
  classifyVoiceError,
  matchVoiceCommand,
  nextFontSize,
  parseStoredFontSize,
  scrollBehavior,
  type UiPrefs,
} from "@/lib/a11y/prefs";
import { getUiPrefs, saveUiPrefs } from "@/lib/actions/account";

/** localStorage key → account field (im_ui_prefs), for syncing (C-22). */
const KEY_TO_PREF: Record<string, keyof UiPrefs> = {
  [A11Y_KEYS.fontSize]: "fontSize",
  [A11Y_KEYS.contrast]: "contrast",
  [A11Y_KEYS.reduceMotion]: "reduceMotion",
  [A11Y_KEYS.largeCursors]: "largeCursors",
  [A11Y_KEYS.visualAlerts]: "visualAlerts",
  [A11Y_KEYS.tts]: "tts",
  [A11Y_KEYS.voice]: "voice",
  [A11Y_KEYS.reading]: "reading",
  [A11Y_KEYS.highlight]: "highlight",
  [A11Y_KEYS.speechRate]: "speechRate",
};
const PULLED_KEY = "im_prefs_pulled";

type TabId = "display" | "speech" | "voice" | "help";

/**
 * Structural type for a SpeechRecognition instance. Declared here rather than
 * relying on lib.dom, which only gained these names recently and still omits
 * them under some TS/DOM lib combinations.
 */
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function speechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return scope.SpeechRecognition || scope.webkitSpeechRecognition || null;
}

/** A continuous session that ends this many times without ever reaching
 *  onstart is not going to recover; stop rather than spin on it. */
const MAX_VOICE_RESTARTS = 5;

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
  const presence = usePresence(open);
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
  const [voiceSupport, setVoiceSupport] = useState<VoiceSupport>("ready");
  const [voiceError, setVoiceError] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  /** Signed in: changes are also saved to the account. */
  const accountRef = useRef(false);
  /** Applying the account's settings: do not echo them back. */
  const pullingRef = useRef(false);
  const pendingRef = useRef<Partial<UiPrefs>>({});
  const pushTimerRef = useRef<number | null>(null);

  /**
   * onend fires *after* the effect cleanup that triggered it, so it cannot read
   * voiceCmds from the closure: it would see the value belonging to the run
   * being torn down and restart a recognizer the user just switched off. This
   * ref is the live answer, and the cleanup clears it before calling abort().
   */
  const voiceOnRef = useRef(false);
  const restartsRef = useRef(0);

  /**
   * The recognition callbacks need the current speech settings, but must not be
   * a reason to rebuild the recognizer. These used to be effect dependencies,
   * so changing the speech rate tore down a live microphone session.
   */
  const ttsRef = useRef(tts);
  const rateRef = useRef(speechRate);
  const alertsRef = useRef(visualAlerts);
  const routerRef = useRef(router);
  useEffect(() => {
    ttsRef.current = tts;
    rateRef.current = speechRate;
    alertsRef.current = visualAlerts;
    routerRef.current = router;
  });

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

    // Resolve support before restoring the stored preference, so an unusable
    // browser shows "not available" instead of a toggle stuck On doing nothing.
    const support = checkVoiceSupport(window);
    setVoiceSupport(support);
    setVoiceCmds(support === "ready" && ls.getItem(A11Y_KEYS.voice) === "true");
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        stopSpeaking();
        // Only reclaim focus when closing our own panel. This listener is on
        // the whole document, so doing it unconditionally pulled focus to the
        // accessibility button on every Escape — out of search boxes, dialogs
        // and toasts.
        if (open) {
          setOpen(false);
          fabRef.current?.focus();
        }
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

  /**
   * Own exactly one SpeechRecognition session for as long as the toggle is on.
   *
   * Depends on voiceCmds alone. Everything else the callbacks need is read from
   * a ref, because tearing this effect down mid-session leaves a recognizer
   * that only onend can stop -- and onend used to restart it.
   */
  useEffect(() => {
    voiceOnRef.current = voiceCmds;
    if (!voiceCmds) return;

    const SR = speechRecognitionCtor();
    if (!SR) {
      setVoiceSupport("unsupported");
      setVoiceCmds(false);
      return;
    }

    restartsRef.current = 0;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-PH";

    // Report listening from the API, not from the fact that start() returned:
    // start() is asynchronous and resolves long before the microphone is live.
    rec.onstart = () => {
      restartsRef.current = 0;
      setListening(true);
    };

    rec.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      const said = last?.[0]?.transcript?.trim() || "";
      if (!said) return;
      setLastCommand(said);
      const action = matchVoiceCommand(said);
      if (!action) return;
      if (alertsRef.current) flashVisualAlert({ message: `Voice: ${said}`, tone: "info" });
      switch (action.type) {
        case "navigate":
          routerRef.current.push(action.href);
          break;
        case "speak":
          if (ttsRef.current) speakText(action.text, rateRef.current);
          break;
        case "scroll":
          if (action.direction === "top") window.scrollTo({ top: 0, behavior: scrollBehavior() });
          else window.scrollBy({ top: action.direction === "down" ? 400 : -400, behavior: scrollBehavior() });
          break;
        case "focus-search":
          (document.querySelector('input[type="search"], input[name="q"], #search') as HTMLInputElement | null)?.focus();
          break;
        case "stop":
          stopSpeaking();
          break;
        case "back":
          routerRef.current.back();
          break;
        case "help":
          if (ttsRef.current)
            speakText(
              "Say go home, go to cart, go to wishlist, read page, scroll down, search, or stop speaking.",
              rateRef.current
            );
          break;
      }
    };

    rec.onerror = (event) => {
      const { fatal, message } = classifyVoiceError(event?.error || "");
      if (!fatal) return; // onend decides whether to retry
      // Clear the flag first so the onend that follows does not restart
      // straight back into the same error.
      voiceOnRef.current = false;
      setVoiceError(message);
      setVoiceCmds(false);
      persist(A11Y_KEYS.voice, "false");
    };

    rec.onend = () => {
      setListening(false);
      if (!voiceOnRef.current) return;
      // A continuous session still ends on its own after a long silence, so a
      // restart is normal. Counting them is what stops a session that fails
      // before onstart from becoming a tight loop.
      if (restartsRef.current >= MAX_VOICE_RESTARTS) {
        setVoiceError("Speech recognition kept stopping. Switch voice commands off and on to try again.");
        return;
      }
      restartsRef.current += 1;
      try {
        rec.start();
      } catch {
        /* already starting; onstart or onend will settle it */
      }
    };

    recognitionRef.current = rec;
    setVoiceError("");
    try {
      rec.start();
    } catch {
      /* InvalidStateError when a session is already running */
    }

    return () => {
      // Order matters. Clearing the flag and detaching the handlers before
      // abort() is what makes switching the toggle off actually release the
      // microphone -- stop() fires onend, and onend restarts.
      voiceOnRef.current = false;
      rec.onstart = null;
      rec.onresult = null;
      rec.onend = null;
      rec.onerror = null;
      try {
        rec.abort();
      } catch {
        /* never started */
      }
      recognitionRef.current = null;
      setListening(false);
    };
  }, [voiceCmds]);

  function persist(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Blocked storage: the setting still applies for this page.
    }
    const field = KEY_TO_PREF[key];
    if (!field || !accountRef.current || pullingRef.current) return;
    (pendingRef.current as Record<string, unknown>)[field] =
      field === "fontSize" || field === "speechRate" ? Number(value) : value === "true";
    if (pushTimerRef.current) window.clearTimeout(pushTimerRef.current);
    pushTimerRef.current = window.setTimeout(() => {
      const changes = pendingRef.current;
      pendingRef.current = {};
      void saveUiPrefs(changes).catch(() => {});
    }, 800);
  }

  /** The account's settings win once per sign-in on this device (C-22). */
  function applyFromAccount(p: UiPrefs) {
    pullingRef.current = true;
    setFontExact(p.fontSize);
    toggleContrast(p.contrast);
    toggleReduceMotion(p.reduceMotion);
    toggleLargeCursors(p.largeCursors);
    setVisualAlerts(p.visualAlerts);
    persist(A11Y_KEYS.visualAlerts, String(p.visualAlerts));
    setTts(p.tts);
    persist(A11Y_KEYS.tts, String(p.tts));
    toggleReading(p.reading);
    toggleHighlight(p.highlight);
    setSpeechRate(p.speechRate);
    persist(A11Y_KEYS.speechRate, String(p.speechRate));
    setVoiceCmds(checkVoiceSupport(window) === "ready" && p.voice);
    persist(A11Y_KEYS.voice, String(p.voice));
    pullingRef.current = false;
  }

  function localPrefs(): UiPrefs {
    const ls = window.localStorage;
    return {
      fontSize: parseStoredFontSize(ls.getItem(A11Y_KEYS.fontSize)),
      contrast: ls.getItem(A11Y_KEYS.contrast) === "true",
      reduceMotion: ls.getItem(A11Y_KEYS.reduceMotion) === "true",
      largeCursors: ls.getItem(A11Y_KEYS.largeCursors) === "true",
      visualAlerts: ls.getItem(A11Y_KEYS.visualAlerts) === "true",
      tts: ls.getItem(A11Y_KEYS.tts) === "true",
      voice: ls.getItem(A11Y_KEYS.voice) === "true",
      reading: ls.getItem(A11Y_KEYS.reading) === "true",
      highlight: ls.getItem(A11Y_KEYS.highlight) !== "false",
      speechRate: Number(ls.getItem(A11Y_KEYS.speechRate) || "1") || 1,
    };
  }

  // After this device's own settings are applied: if someone is signed in,
  // apply their account's settings once per sign-in (a setting chosen on
  // another device follows them here), or — when the account has none yet —
  // save this device's settings to it. Guests stay browser-only.
  useEffect(() => {
    let cancelled = false;
    getUiPrefs()
      .then((res) => {
        if (cancelled || !res.signedIn || !res.userId) return;
        accountRef.current = true;
        let pulled: string | null = null;
        try {
          pulled = window.sessionStorage.getItem(PULLED_KEY);
          window.sessionStorage.setItem(PULLED_KEY, String(res.userId));
        } catch {}
        if (pulled === String(res.userId)) return;
        if (res.prefs) applyFromAccount(res.prefs);
        else void saveUiPrefs(localPrefs()).catch(() => {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Runs once per page load; the functions it calls only touch state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (next && voiceSupport !== "ready") {
      setVoiceError(
        voiceSupport === "insecure"
          ? "Voice commands need a secure (https) connection to this site."
          : "This browser has no speech recognition. Chrome or Edge support it."
      );
      return;
    }
    setVoiceError("");
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
      {presence.mounted ? (
        <div
          className="a11y-panel a11y-panel--rich"
          data-state={presence.closing ? "closing" : "open"}
          inert={presence.closing}
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
                <button
                  type="button"
                  className="a11y-option"
                  aria-pressed={voiceCmds}
                  disabled={voiceSupport !== "ready"}
                  onClick={() => toggleVoice(!voiceCmds)}
                >
                  <span>Voice commands</span>
                  <span className="a11y-option__state">{voiceCmds ? "On" : "Off"}</span>
                </button>
                {/* The speech API fails silently. Without somewhere to say so,
                    a blocked microphone is indistinguishable from a dead
                    button, which is exactly how this read before. */}
                {voiceError ? (
                  <p className="a11y-hint a11y-hint--error small" role="alert">
                    {voiceError}
                  </p>
                ) : null}
                {voiceCmds ? (
                  <p className="a11y-hint muted small" aria-live="polite">
                    {listening ? "Listening…" : "Starting microphone…"}
                    {lastCommand ? ` · Last: “${lastCommand}”` : ""}
                    <br />
                    Try “go home”, “go to cart”, “read page”, “scroll down”, “search”.
                  </p>
                ) : (
                  <p className="a11y-hint muted small">
                    {voiceSupport === "ready"
                      ? "Uses the browser speech recognition API. Your browser will ask for microphone permission."
                      : voiceSupport === "insecure"
                        ? "Needs a secure (https) connection to this site."
                        : "Not available in this browser — Chrome or Edge support it."}
                  </p>
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
