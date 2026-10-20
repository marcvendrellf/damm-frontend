"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEMO_MODE } from "@/lib/api/client";
import { cn } from "@/lib/utils";

// Mock authentication — backend `/auth/*` endpoints not implemented yet.
// Login/SSO requirements aren't documented in the wiki; this stub just sets a
// localStorage flag so AppShell can gate the app surfaces and route the user
// to the dashboard.
export const AUTH_FLAG_KEY = "damm_auth";

function markAuthenticated() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_FLAG_KEY, "1");
}

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<"email" | "google" | null>(null);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting("email");
    markAuthenticated();
    router.replace("/");
  };

  const handleGoogle = () => {
    setSubmitting("google");
    markAuthenticated();
    router.replace("/");
  };

  return (
    <form
      className={cn("flex flex-col gap-6", className)}
      onSubmit={handleSubmit}
      {...props}
    >
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-2xl font-bold">Login to your account</h1>
        <p className="text-sm text-balance text-ink-muted">
          Enter your email below to login to your account
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="m@example.com"
          autoComplete="email"
          // The demo fills in an account, so visitors only press Login.
          defaultValue={DEMO_MODE ? "demo@damm.com" : undefined}
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center">
          <Label htmlFor="password">Password</Label>
          <Link
            href="#"
            className="ml-auto text-sm underline-offset-4 hover:underline"
          >
            Forgot your password?
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          defaultValue={DEMO_MODE ? "smarttruck" : undefined}
          required
        />
      </div>

      <Button type="submit" disabled={submitting !== null}>
        {submitting === "email" ? "Signing in…" : "Login"}
      </Button>

      <div className="relative text-center text-sm text-ink-subtle">
        <span className="relative z-10 bg-surface-1 px-2">
          Or continue with
        </span>
        <span
          aria-hidden
          className="absolute inset-x-0 top-1/2 -z-0 h-px -translate-y-1/2 bg-border"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          type="button"
          onClick={handleGoogle}
          disabled={submitting !== null}
        >
          <GoogleIcon />
          Login with Google
        </Button>
        <p className="text-center text-sm text-ink-muted">
          Don&apos;t have an account?{" "}
          <Link href="#" className="underline underline-offset-4">
            Sign up
          </Link>
        </p>
      </div>
    </form>
  );
}

function GoogleIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className="size-4"
      aria-hidden
    >
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.45-1.74 4.25-5.5 4.25-3.31 0-6.01-2.74-6.01-6.12S8.69 6.11 12 6.11c1.88 0 3.14.8 3.86 1.49l2.63-2.54C16.84 3.5 14.66 2.5 12 2.5 6.99 2.5 2.95 6.54 2.95 11.55S6.99 20.6 12 20.6c6.93 0 9.6-4.86 9.6-7.36 0-.5-.06-.88-.13-1.04H12z"
      />
      <path
        fill="#4285F4"
        d="M21.6 12.27c0-.7-.06-1.37-.17-2.02H12v3.85h5.5a4.7 4.7 0 0 1-2.04 3.07v2.55h3.3c1.93-1.78 3.04-4.4 3.04-7.45z"
      />
      <path
        fill="#FBBC05"
        d="M5.99 14.16a5.55 5.55 0 0 1-.3-1.79c0-.62.11-1.22.3-1.79V8.03H2.6A9.6 9.6 0 0 0 1.5 12.37c0 1.55.37 3.02 1.1 4.34l3.39-2.55z"
      />
      <path
        fill="#34A853"
        d="M12 5.95c1.74 0 2.92.75 3.59 1.38l2.62-2.55C16.6 3.31 14.49 2.5 12 2.5 8.07 2.5 4.69 4.74 3.05 8.03l3.4 2.55C7.27 8.13 9.43 5.95 12 5.95z"
      />
    </svg>
  );
}
