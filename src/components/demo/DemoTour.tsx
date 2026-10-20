"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// A first-visit guide for the demo: a hint next to the thing to click next,
// from Login to driving a route on the map. The step is read from what is on
// screen, so the hint follows the visitor wherever they go. It ends when they
// press Play or skip it.

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
    title: "Log in",
    body: "The demo account is already filled in.",
    side: "right",
  },
  {
    target: '[data-tour="centers"] tr[data-row-id]',
    title: "Open the center",
    body: "DDI Mollet is where the trucks leave from.",
    side: "bottom",
  },
  {
    target: '[data-tour="routes"] [data-table-add]',
    title: "Plan a day",
    body: "Add Route asks the optimizer to plan a day of deliveries.",
    side: "bottom",
  },
  {
    target: '[data-tour="generate"]',
    title: "Generate the routes",
    body: "A day with orders is already picked. The optimizer splits them between the trucks.",
    side: "bottom",
  },
  {
    target: '[data-tour="save-all"]',
    title: "Save the plan",
    body: "Each truck on the left is one route. Click them to compare, then save them all.",
    side: "top",
  },
  {
    target: '[data-tour="routes"] tr[data-row-id]',
    title: "Open a route",
    body: "See how its truck is loaded and where it drives.",
    side: "bottom",
  },
  {
    target: '[data-tour="map-tab"]',
    title: "Open the map",
    body: "Drag to turn the truck, or click a pallet to see what it carries. Then see the route on the map.",
    side: "bottom",
  },
  {
    target: '[data-tour="play"]',
    title: "Drive the route",
    body: "Press Play to follow the truck from stop to stop.",
    side: "top",
  },
];

const DONE_KEY = "smarttruck_tour_done";
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

function findStep(): { index: number; el: HTMLElement } | null {
  if (document.querySelector(POPUPS)) return null;
  // With a dialog open, only its own buttons count, not the page behind it.
  const scope =
    document.querySelector(`${DIALOG}:not([data-closed])`) ?? document;
  // Later steps win: once a plan is saved, the center page shows both
  // Add Route and the new routes.
  for (let index = STEPS.length - 1; index >= 0; index--) {
    const el = scope.querySelector<HTMLElement>(STEPS[index]!.target);
    if (
      el &&
      el.getClientRects().length > 0 &&
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

export function DemoTour() {
  const [done, setDone] = useState(true);
  const [step, setStep] = useState<number | null>(null);

  const shownRef = useRef<number | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDone(window.localStorage.getItem(DONE_KEY) === "1");
  }, []);

  const finish = useCallback(() => {
    window.localStorage.setItem(DONE_KEY, "1");
    setDone(true);
  }, []);

  const place = useCallback(() => {
    const index = shownRef.current;
    const target = targetRef.current;
    const ring = ringRef.current;
    const bubble = bubbleRef.current;
    const arrow = arrowRef.current;
    if (index === null || !target || !ring || !bubble || !arrow) return;
    position(target, STEPS[index]!.side, ring, bubble, arrow);
  }, []);

  // Each step mounts hidden; place it before the browser paints it.
  useLayoutEffect(() => {
    shownRef.current = step;
    place();
  }, [step, place]);

  // Check every frame, so the hint keeps up with dialogs opening and
  // resizing, tabs switching and pages scrolling.
  useEffect(() => {
    if (done) return;
    let frame = 0;
    const tick = () => {
      const found = findStep();
      targetRef.current = found?.el ?? null;
      const index = found?.index ?? null;
      if (index === shownRef.current) place();
      else setStep(index);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [done, place]);

  // Pressing Play is the last step.
  useEffect(() => {
    if (done) return;
    const onClick = (e: MouseEvent) => {
      if (
        shownRef.current === STEPS.length - 1 &&
        targetRef.current?.contains(e.target as Node)
      ) {
        finish();
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [done, finish]);

  if (done || step === null) return null;
  const { title, body } = STEPS[step]!;

  return (
    <div key={step}>
      <div
        ref={ringRef}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[52] rounded-lg ring-2 ring-primary"
        style={{ visibility: "hidden" }}
      />
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
          <span className="tabular-nums">
            {step + 1} of {STEPS.length}
          </span>
          <button
            type="button"
            onClick={finish}
            className="font-medium hover:text-white"
          >
            Skip tour
          </button>
        </div>
      </div>
    </div>
  );
}
