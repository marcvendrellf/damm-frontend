"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// A first-visit guide for the demo: a hint next to the thing to click next,
// from Login to driving a route on the map. The step is read from what is on
// screen, so the hint follows the visitor wherever they go. It ends when they
// press Play or skip it, and the header's Take the tour button starts it again.

type Side = "top" | "bottom" | "left" | "right";

type Step = {
  target: string;
  title: string;
  body: string;
  side: Side;
};

const STEPS: Step[] = [
  {
    target: '[data-tour="login"]',
    title: "Click Login",
    body: "The demo account is already filled in.",
    side: "right",
  },
  {
    target: '[data-tour="centers"] tr[data-row-id]',
    title: "Click DDI Mollet",
    body: "It's the distribution center the trucks leave from.",
    side: "bottom",
  },
  {
    target: '[data-tour="routes"] [data-table-add]',
    title: "Click Add Route",
    body: "The optimizer will plan a day of deliveries from this center.",
    side: "bottom",
  },
  {
    target: '[data-tour="generate"]',
    title: "Click Generate Routes",
    body: "A day with orders is already picked. The optimizer splits them between the trucks.",
    side: "bottom",
  },
  {
    target: '[data-tour="save-all"]',
    title: "Click Save all",
    body: "Each truck on the left is one route. You can click them to compare them first.",
    side: "top",
  },
  {
    target: '[data-tour="routes"] tr[data-row-id]',
    title: "Click a route",
    body: "See how its truck is loaded and where it drives.",
    side: "bottom",
  },
  {
    target: '[data-tour="map-tab"]',
    title: "Click Map",
    body: "But first, drag to turn the truck, or click a pallet to see what it carries.",
    side: "bottom",
  },
  {
    target: '[data-tour="play"]',
    title: "Click Play",
    body: "Follow the truck from stop to stop.",
    side: "top",
  },
];

// Shown after Skip, next to the button that starts the tour again.
const REMINDER: Step = {
  target: '[data-tour="restart"]',
  title: "Tour skipped",
  body: "You can always start it again from here.",
  side: "bottom",
};

const DONE_KEY = "smarttruck_tour_done";
// The furthest step reached, so a reload carries on from there.
const STEP_KEY = "smarttruck_tour_step";
const START_EVENT = "smarttruck:tour";
const FADE_MS = 200;
const REMINDER_MS = 5000;
// After this long without a click, the ring pulses: the visitor may be
// waiting for a Next button, when what moves the tour on is clicking the
// highlighted one.
const IDLE_MS = 6000;
const PULSE: Keyframe[] = [
  { boxShadow: "0 0 0 0 rgb(94 106 210 / 0.7)" },
  { boxShadow: "0 0 0 14px rgb(94 106 210 / 0)" },
];
const GAP = 12;
const MARGIN = 8;

const DIALOG = '[data-slot="dialog-content"]';

// The hint steps aside while the date picker or a menu is open.
const POPUPS =
  '[data-slot="popover-content"], [data-slot="dropdown-menu-content"]';

const OPPOSITE: Record<Side, Side> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max);

// Opacity only: the hint is placed with a transform, so it must not be
// animated, or the hint would slide in from the corner.
function fade(els: (HTMLElement | null)[], from: number, to: number) {
  for (const el of els) {
    el?.animate([{ opacity: from }, { opacity: to }], {
      duration: FADE_MS,
      easing: "ease",
      fill: "forwards",
    });
  }
}

export function startDemoTour() {
  window.dispatchEvent(new Event(START_EVENT));
}

function isShown(el: HTMLElement | null): el is HTMLElement {
  return !!el && el.getClientRects().length > 0;
}

function findStep(reached: number): { index: number; el: HTMLElement } | null {
  if (document.querySelector(POPUPS)) return null;
  // With a dialog open, only its own buttons count, not the page behind it.
  const scope =
    document.querySelector(`${DIALOG}:not([data-closed])`) ?? document;
  // Later steps win: once a plan is saved, the center page shows both
  // Add Route and the new routes. Steps more than one past the furthest
  // reached wait their turn, so a replay doesn't skip to routes saved before.
  for (
    let index = Math.min(reached + 1, STEPS.length - 1);
    index >= 0;
    index--
  ) {
    const el = scope.querySelector<HTMLElement>(STEPS[index]!.target);
    if (
      isShown(el) &&
      // A closed dialog stays mounted while it fades out.
      !el.closest(`${DIALOG}[data-closed]`)
    ) {
      return { index, el };
    }
  }
  return null;
}

function position(
  target: HTMLElement,
  preferred: Side,
  ring: HTMLElement,
  bubble: HTMLElement,
  arrow: HTMLElement,
) {
  const t = target.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  ring.style.transform = `translate(${t.left - 4}px, ${t.top - 4}px)`;
  ring.style.width = `${t.width + 8}px`;
  ring.style.height = `${t.height + 8}px`;

  const w = bubble.offsetWidth;
  const h = bubble.offsetHeight;
  const fits: Record<Side, boolean> = {
    top: t.top - GAP - h >= MARGIN,
    bottom: t.bottom + GAP + h <= vh - MARGIN,
    left: t.left - GAP - w >= MARGIN,
    right: t.right + GAP + w <= vw - MARGIN,
  };
  // Flip when the preferred side has no room; below is the last resort,
  // as the hint can always slide along it to stay on screen.
  const side =
    [preferred, OPPOSITE[preferred], "bottom" as const, "top" as const].find(
      (s) => fits[s],
    ) ?? "bottom";

  let x: number;
  let y: number;
  if (side === "top" || side === "bottom") {
    x = clamp(t.left + t.width / 2 - w / 2, MARGIN, vw - w - MARGIN);
    y = side === "top" ? t.top - GAP - h : t.bottom + GAP;
    arrow.style.left = `${clamp(t.left + t.width / 2 - x, 16, w - 16)}px`;
    arrow.style.top = side === "top" ? `${h}px` : "0px";
  } else {
    x = side === "left" ? t.left - GAP - w : t.right + GAP;
    y = clamp(t.top + t.height / 2 - h / 2, MARGIN, vh - h - MARGIN);
    arrow.style.left = side === "left" ? `${w}px` : "0px";
    arrow.style.top = `${clamp(t.top + t.height / 2 - y, 16, h - 16)}px`;
  }
  bubble.style.transform = `translate(${x}px, ${y}px)`;

  ring.style.visibility = "visible";
  bubble.style.visibility = "visible";
}

type Phase = "off" | "tour" | "reminder";
type Hint = number | "reminder";

export function DemoTour() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("off");
  const [hint, setHint] = useState<Hint | null>(null);
  const [leaving, setLeaving] = useState(false);

  const shownRef = useRef<Hint | null>(null);
  const reachedRef = useRef(0);
  const leaveTimerRef = useRef<number | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const pulseRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.localStorage.getItem(DONE_KEY) === "1") return;
    reachedRef.current = Number(window.localStorage.getItem(STEP_KEY)) || 0;
    setPhase("tour");
  }, []);

  // Fade the hint out, then go on to the next phase.
  const leave = useCallback((next: Phase) => {
    if (leaveTimerRef.current !== null) return;
    setLeaving(true);
    fade([ringRef.current, bubbleRef.current], 1, 0);
    leaveTimerRef.current = window.setTimeout(() => {
      leaveTimerRef.current = null;
      setLeaving(false);
      setHint(null);
      setPhase(next);
    }, FADE_MS);
  }, []);

  const end = useCallback(
    (next: Phase) => {
      window.localStorage.setItem(DONE_KEY, "1");
      leave(next);
    },
    [leave],
  );

  // The header's Take the tour button: start over from the centers list.
  useEffect(() => {
    const start = () => {
      if (leaveTimerRef.current !== null) {
        window.clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = null;
      }
      window.localStorage.removeItem(DONE_KEY);
      window.localStorage.removeItem(STEP_KEY);
      reachedRef.current = 0;
      setLeaving(false);
      setHint(null);
      setPhase("tour");
      router.push("/");
    };
    window.addEventListener(START_EVENT, start);
    return () => window.removeEventListener(START_EVENT, start);
  }, [router]);

  const place = useCallback(() => {
    const shown = shownRef.current;
    const target = targetRef.current;
    const ring = ringRef.current;
    const bubble = bubbleRef.current;
    const arrow = arrowRef.current;
    if (shown === null || !target || !ring || !bubble || !arrow) return;
    const { side } = shown === "reminder" ? REMINDER : STEPS[shown]!;
    position(target, side, ring, bubble, arrow);
  }, []);

  // Each hint mounts hidden; place it before the browser paints it.
  useLayoutEffect(() => {
    shownRef.current = hint;
    if (typeof hint === "number" && hint > reachedRef.current) {
      reachedRef.current = hint;
      window.localStorage.setItem(STEP_KEY, String(hint));
    }
    place();
    if (hint !== null) fade([ringRef.current, bubbleRef.current], 0, 1);
  }, [hint, place]);

  // Check every frame, so the hint keeps up with dialogs opening and
  // resizing, tabs switching and pages scrolling.
  useEffect(() => {
    if (phase === "off" || leaving) return;
    let frame = 0;
    const tick = () => {
      let next: Hint | null = null;
      if (phase === "tour") {
        const found = findStep(reachedRef.current);
        targetRef.current = found?.el ?? null;
        next = found?.index ?? null;
      } else {
        const el = document.querySelector<HTMLElement>(REMINDER.target);
        targetRef.current = isShown(el) ? el : null;
        next = targetRef.current ? "reminder" : null;
      }
      if (next === shownRef.current) place();
      else setHint(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, leaving, place]);

  // Pressing Play is the last step.
  useEffect(() => {
    if (phase !== "tour") return;
    const onClick = (e: MouseEvent) => {
      if (
        shownRef.current === STEPS.length - 1 &&
        targetRef.current?.contains(e.target as Node)
      ) {
        end("off");
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [phase, end]);

  // Pulse the ring when the visitor seems stuck, and stop at their next click.
  useEffect(() => {
    if (typeof hint !== "number" || leaving) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer = 0;
    let pulse: Animation | undefined;
    const wait = () => {
      pulse?.cancel();
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        pulse = pulseRef.current?.animate(PULSE, {
          duration: 1400,
          easing: "ease-out",
          iterations: Infinity,
        });
      }, IDLE_MS);
    };
    wait();
    const events = ["pointerdown", "keydown", "wheel"] as const;
    for (const e of events) window.addEventListener(e, wait, true);
    return () => {
      window.clearTimeout(timer);
      pulse?.cancel();
      for (const e of events) window.removeEventListener(e, wait, true);
    };
  }, [hint, leaving]);

  // The reminder goes away on its own.
  useEffect(() => {
    if (hint !== "reminder") return;
    const timer = window.setTimeout(() => leave("off"), REMINDER_MS);
    return () => window.clearTimeout(timer);
  }, [hint, leave]);

  if (phase === "off" || hint === null) return null;
  const isReminder = hint === "reminder";
  const { title, body } = isReminder ? REMINDER : STEPS[hint]!;

  return (
    <div key={hint}>
      <div
        ref={ringRef}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[52] rounded-lg ring-2 ring-primary"
        style={{ visibility: "hidden" }}
      >
        {/* Its own layer: the ring itself is drawn with box-shadow. */}
        <div ref={pulseRef} className="absolute inset-0 rounded-[inherit]" />
      </div>
      <div
        ref={bubbleRef}
        role="status"
        className="fixed left-0 top-0 z-[52] w-64 rounded-lg bg-primary p-3 text-primary-foreground shadow-xl"
        style={{ visibility: "hidden" }}
      >
        <div
          ref={arrowRef}
          aria-hidden
          className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-primary"
        />
        <p className="text-[13px] font-semibold">{title}</p>
        <p className="mt-1 text-[12px] leading-snug text-white/85">{body}</p>
        <div className="mt-2.5 flex items-center justify-between text-[11px] text-white/70">
          {isReminder ? (
            <button
              type="button"
              onClick={() => leave("off")}
              className="ml-auto font-medium hover:text-white"
            >
              Got it
            </button>
          ) : (
            <>
              <span className="tabular-nums">
                {hint + 1} of {STEPS.length}
              </span>
              <button
                type="button"
                onClick={() => end("reminder")}
                className="font-medium hover:text-white"
              >
                Skip tour
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
