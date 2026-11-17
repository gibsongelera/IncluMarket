"use client";

/**
 * RailScroller (P4-02, ADR-06): one scrolling row for the storefront home,
 * and the hero carousel. No library, nothing autoplays (so no Pause button),
 * nothing moves unless the person asks.
 *
 * How the next steps use it
 *
 *   P4-05, a product rail. The page stays a Server Component and keeps
 *   rendering the cards; they pass through as children.
 *
 *     <section className="rail" aria-labelledby="deals-title">
 *       <RailScroller
 *         label="deals"                       // "Previous deals" / "Next deals"
 *         ariaLabelledby="deals-title"        // names the list of cards
 *         heading={<h2 id="deals-title">Today's deals</h2>}
 *         actions={<Link className="section-head__link" href="…">View all<span className="sr-only"> deals</span></Link>}
 *       >
 *         {items.map((i) => <ProductCard key={i.id} … />)}
 *       </RailScroller>
 *     </section>
 *
 *   P4-04, the category tiles: the same, with trackClassName="rail__track--tiles"
 *   and one tile link per child. responsive.css is imported last, so the
 *   modifier's width rules go there, after the RailScroller block, or carry
 *   three classes (`.rail-scroller--rail .rail__track.rail__track--tiles`).
 *
 *   P4-03, the hero (components/BannerStrip.tsx): variant="hero",
 *   label="promotion" ("Previous promotion"), ariaLabel="Promotions",
 *   slideLabels from the banner titles, one banner link per child. One slide
 *   per view at every width; the buttons and the "2 of 4" counter sit under
 *   the slide, so they never cover text baked into a banner image.
 *
 * Children: one element per item (arrays are flattened, fragments are not).
 * The component wraps each one: `<li class="rail__item">` in the rail's
 * `<ul class="rail__track" role="list">`; in the hero, a
 * `<div class="rail__item" role="group" aria-roledescription="slide"
 * aria-label="2 of 4">` (an <li> cannot take role="group" inside a list).
 *
 * Behaviour
 *   - The buttons render only after mount and only while the track overflows,
 *     so without JavaScript (or with five cards that fit) the row is a plain
 *     scrollable list with no dead buttons. Below 768px a rail is a 2-column
 *     wrap that never overflows, so it has none (styles/responsive.css).
 *   - Previous / Next scroll to the next whole item (pageBy, lib/rail.ts:
 *     one view for cards that divide it exactly); scroll-snap
 *     lands it on whole cards. Instant under either reduced-motion switch
 *     (scrollBehavior() in lib/a11y/prefs.ts).
 *   - At an end the button is aria-disabled="true" and does nothing. Never
 *     the disabled attribute: that drops a focused button's focus to <body>
 *     the moment it reaches the end (findings 43/46).
 *   - The ends come from the scroll event (passive) and a ResizeObserver
 *     (width, and the 12–24px text setting), within 1px (lib/rail.ts).
 *   - Keyboard: plain Tab order (header, buttons, then the cards; in the hero
 *     the slides, then the buttons under them). Focusing a card out of view
 *     scrolls it in; the track's scroll-padding keeps its ring visible. No
 *     arrow-key handling, so nothing is hijacked and nothing traps focus.
 *   - The hero's counter is plain text. A polite live region says the new
 *     slide only after a button press, with its name from `slideLabels`.
 *     While the buttons show, slides out of view are inert, so Tab reaches
 *     only the one on screen. A single banner gets no carousel roles.
 */

import { Children, isValidElement, useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { scrollBehavior } from "@/lib/a11y/prefs";
import { pageDelta, railPosition } from "@/lib/rail";
import { Icon } from "./Icon";

export type RailVariant = "rail" | "hero";

export interface RailScrollerProps {
  /** The noun the buttons scroll: "deals" names them "Previous deals" and "Next deals". */
  label: string;
  /** "rail" (default): cards in a row from 768px up. "hero": one slide per view. */
  variant?: RailVariant;
  /** Left of the header row: the section's <h2> (with a countdown, if any). */
  heading?: ReactNode;
  /** Right of the header row, before the buttons: the "View all" link. */
  actions?: ReactNode;
  /** Extra class on the track (P4-04's tile modifier). */
  trackClassName?: string;
  /** Id of the visible heading that names the list (rail) or the carousel (hero). */
  ariaLabelledby?: string;
  /** Hero only, when there is no visible heading: the carousel's name. */
  ariaLabel?: string;
  /** Hero only: each slide's name (a banner's title), said after a press. */
  slideLabels?: readonly string[];
  children: ReactNode;
}

/**
 * How far one press scrolls: to the next whole item (lib/rail.ts pageDelta),
 * measured from the view's content edge (the track's scroll padding, where
 * snap points land). Cards that divide the view exactly page by one view;
 * fixed-width tiles page so no half-visible tile is skipped.
 */
function pageBy(track: HTMLElement, direction: -1 | 1): number {
  const style = window.getComputedStyle(track);
  const padStart = parseFloat(style.scrollPaddingInlineStart) || 0;
  const padEnd = parseFloat(style.scrollPaddingInlineEnd) || 0;
  const viewStart = track.getBoundingClientRect().left + track.clientLeft + padStart;
  const viewWidth = track.clientWidth - padStart - padEnd;
  const spans = Array.from(track.children, (el) => {
    const r = el.getBoundingClientRect();
    return { start: r.left - viewStart, end: r.right - viewStart };
  });
  return pageDelta(spans, viewWidth, direction) ?? direction * track.clientWidth;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function RailScroller({
  label,
  variant = "rail",
  heading,
  actions,
  trackClassName,
  ariaLabelledby,
  ariaLabel,
  slideLabels,
  children,
}: RailScrollerProps) {
  const hero = variant === "hero";
  const trackId = useId();
  const trackRef = useRef<HTMLElement | null>(null);
  // A callback ref, so one ref serves the rail's <ul> and the hero's <div>.
  const setTrack = useCallback((el: HTMLElement | null) => {
    trackRef.current = el;
  }, []);

  const items = Children.toArray(children);
  const count = items.length;

  const [ready, setReady] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);
  const [index, setIndex] = useState(0);
  const [announce, setAnnounce] = useState("");
  const announceTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(announceTimer.current), []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    // Primitive states, so a scroll event that changes nothing re-renders nothing.
    const measure = () => {
      const p = railPosition(
        { scrollLeft: track.scrollLeft, scrollWidth: track.scrollWidth, clientWidth: track.clientWidth },
        count
      );
      setOverflow(p.overflow);
      setAtStart(p.atStart);
      setAtEnd(p.atEnd);
      setIndex(p.index);
    };
    measure();
    setReady(true);
    track.addEventListener("scroll", measure, { passive: true });
    // The track's box changes with the window and with the text setting (its
    // padding and the cards are rem), which is when the overflow can change.
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    if (observer) observer.observe(track);
    else window.addEventListener("resize", measure);
    return () => {
      track.removeEventListener("scroll", measure);
      if (observer) observer.disconnect();
      else window.removeEventListener("resize", measure);
    };
  }, [count]);

  const showControls = ready && overflow;

  function step(direction: -1 | 1) {
    const track = trackRef.current;
    // aria-disabled says this button is at its end: then it does nothing.
    if (!track || (direction < 0 ? atStart : atEnd)) return;
    // Read where the track is now, not the last render: a second press during
    // a smooth scroll starts from the middle of it.
    const now = railPosition(
      { scrollLeft: track.scrollLeft, scrollWidth: track.scrollWidth, clientWidth: track.clientWidth },
      count
    ).index;
    track.scrollBy({ left: pageBy(track, direction), behavior: scrollBehavior() });
    if (hero) {
      const next = Math.min(count, Math.max(1, now + 1 + direction));
      const name = slideLabels?.[next - 1];
      // Empty the region first: the same words set twice are not read again.
      setAnnounce("");
      window.clearTimeout(announceTimer.current);
      announceTimer.current = window.setTimeout(
        () => setAnnounce(`${capitalise(label)} ${next} of ${count}${name ? `: ${name}` : ""}`),
        100
      );
    }
  }

  const controls = (
    <div className="rail__controls">
      <button
        type="button"
        className="rail__btn"
        aria-controls={trackId}
        aria-disabled={atStart ? "true" : undefined}
        onClick={() => step(-1)}
      >
        <Icon name="chevron-left" />
        <span className="sr-only">Previous {label}</span>
      </button>
      {hero ? (
        <p className="rail__counter">
          <span className="sr-only">{capitalise(label)} </span>
          {index + 1} of {count}
        </p>
      ) : null}
      <button
        type="button"
        className="rail__btn"
        aria-controls={trackId}
        aria-disabled={atEnd ? "true" : undefined}
        onClick={() => step(1)}
      >
        <Icon name="chevron-right" />
        <span className="sr-only">Next {label}</span>
      </button>
    </div>
  );

  const trackClass = `rail__track${trackClassName ? ` ${trackClassName}` : ""}`;
  const keyOf = (child: ReactNode, i: number) => (isValidElement(child) && child.key != null ? child.key : i);
  const rootClass = `rail-scroller rail-scroller--${variant}${showControls ? " has-controls" : ""}`;

  if (hero) {
    // One banner is not a carousel: no carousel or slide roles, no buttons.
    const carousel = count > 1;
    return (
      <section
        className={rootClass}
        aria-roledescription={carousel ? "carousel" : undefined}
        aria-labelledby={ariaLabelledby}
        aria-label={ariaLabelledby ? undefined : (ariaLabel ?? capitalise(label))}
      >
        {heading || actions ? (
          <div className="section-head">
            {heading}
            {actions ? <div className="rail__end">{actions}</div> : null}
          </div>
        ) : null}
        <div ref={setTrack} id={trackId} className={trackClass}>
          {items.map((child, i) => (
            <div
              key={keyOf(child, i)}
              className="rail__item"
              role={carousel ? "group" : undefined}
              aria-roledescription={carousel ? "slide" : undefined}
              aria-label={carousel ? `${i + 1} of ${count}` : undefined}
              // With the buttons showing, only the slide in view is in the Tab
              // order, so Shift+Tab from Previous lands on what is on screen.
              // Without them (no JavaScript) every slide stays reachable.
              inert={showControls && i !== index ? true : undefined}
            >
              {child}
            </div>
          ))}
        </div>
        {showControls ? (
          <>
            {controls}
            <p className="sr-only" aria-live="polite">
              {announce}
            </p>
          </>
        ) : null}
      </section>
    );
  }

  return (
    <div className={rootClass}>
      {heading || actions || showControls ? (
        <div className="section-head">
          {heading}
          {actions || showControls ? (
            <div className="rail__end">
              {actions}
              {showControls ? controls : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <ul ref={setTrack} id={trackId} className={trackClass} role="list" aria-labelledby={ariaLabelledby}>
        {items.map((child, i) => (
          <li key={keyOf(child, i)} className="rail__item">
            {child}
          </li>
        ))}
      </ul>
    </div>
  );
}
