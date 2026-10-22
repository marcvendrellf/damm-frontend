import type { Metadata } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import { DemoTour } from "@/components/demo/DemoTour";
import { DEMO_MODE } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "SmartTruck Planner",
  description: "Damm route and load optimization planner",
};

// Root layout intentionally minimal — the (app) and (auth) route groups own
// their own chrome. This keeps the login screen free of dashboard layout.
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn("dark", geist.variable, jetbrainsMono.variable)}>
      <body className="min-h-screen antialiased">
        {children}
        {DEMO_MODE ? <DemoTour /> : null}
      </body>
    </html>
  );
}
