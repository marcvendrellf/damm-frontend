"use client";

import Link from "next/link";
import { Fragment } from "react";
import { IconHelpCircle } from "@tabler/icons-react";

import { startDemoTour } from "@/components/demo/DemoTour";
import { useBreadcrumb } from "@/components/shell/breadcrumb";
import { DEMO_MODE } from "@/lib/api/client";

type Props = {
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
};

export function Header({ onToggleSidebar, sidebarOpen }: Props) {
  const { crumbs } = useBreadcrumb();

  return (
    <header className="sticky top-0 z-20 shrink-0 bg-canvas/90 backdrop-blur-md flex h-10 items-center">
      <div className="relative flex items-center gap-2 px-3 md:w-52 md:shrink-0 overflow-visible">
        <button
          type="button"
          aria-label="Open navigation"
          aria-expanded={sidebarOpen}
          onClick={onToggleSidebar}
          className="md:hidden h-7 w-7 rounded-md flex items-center justify-center text-ink-muted transition-colors hover:bg-white/[0.04] hover:text-ink"
        >
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden>
            <path
              d="M2 4h12M2 8h12M2 12h12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <Link
          href="/"
          aria-label="Damm"
          className="relative z-10 flex items-center"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/damm-logo.svg"
            alt="Damm"
            className="h-7 w-auto max-w-none pointer-events-auto"
          />
        </Link>
      </div>

      <nav
        aria-label="Breadcrumb"
        className="flex flex-1 items-center gap-2 px-3 text-[13px] font-medium min-w-0"
      >
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          const isLink = !isLast && crumb.onClick;
          return (
            <Fragment key={`${i}-${crumb.label}`}>
              {i > 0 ? (
                <span className="text-ink-tertiary shrink-0" aria-hidden>
                  ›
                </span>
              ) : null}
              {isLink ? (
                <button
                  type="button"
                  onClick={crumb.onClick}
                  className="text-ink-muted hover:text-ink transition-colors truncate"
                >
                  {crumb.label}
                </button>
              ) : (
                <span
                  className={`truncate ${isLast ? "text-ink" : "text-ink-muted"}`}
                  aria-current={isLast ? "page" : undefined}
                >
                  {crumb.label}
                </span>
              )}
            </Fragment>
          );
        })}
      </nav>

      {DEMO_MODE ? (
        <button
          type="button"
          onClick={startDemoTour}
          aria-label="Take the tour"
          data-tour="restart"
          className="mr-3 flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-ink-muted transition-colors hover:bg-white/[0.04] hover:text-ink"
        >
          <IconHelpCircle className="size-4" aria-hidden />
          <span className="hidden sm:inline">Take the tour</span>
        </button>
      ) : null}
    </header>
  );
}
