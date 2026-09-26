"use client";

import { useState } from "react";
import LiveTryOn from "@/components/live-tryon";
import PhotoTryOn from "@/components/photo-tryon";

type Mode = "live" | "photo";

export default function Playground() {
  const [mode, setMode] = useState<Mode>("live");

  return (
    <main className="mx-auto max-w-5xl px-3 py-5 sm:px-4 sm:py-12">
      {/* Header */}
      <header className="mb-6 text-center">
        <h1 className="font-mono text-xl font-bold tracking-tight sm:text-3xl">
          <span className="text-accent">◆</span> AI TRY-ON PLAYGROUND
        </h1>
        <p className="mt-1 text-sm text-neutral-400">
          Realtime and single-shot virtual try-on powered by Decart
        </p>
      </header>

      {/* Mode tabs */}
      <div className="mx-auto mb-6 grid w-full max-w-md grid-cols-2 gap-1 rounded-xl border border-border bg-surface p-1">
        <button
          onClick={() => setMode("live")}
          className={`rounded-lg px-2 py-2.5 font-mono text-[13px] font-semibold transition sm:px-4 sm:text-sm ${
            mode === "live"
              ? "bg-accent text-white shadow-lg shadow-accent/20"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          ⚡ Live Try-On
        </button>
        <button
          onClick={() => setMode("photo")}
          className={`rounded-lg px-2 py-2.5 font-mono text-[13px] font-semibold transition sm:px-4 sm:text-sm ${
            mode === "photo"
              ? "bg-accent text-white shadow-lg shadow-accent/20"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          📷 Photo Try-On
        </button>
      </div>

      {mode === "live" ? <LiveTryOn /> : <PhotoTryOn />}

      <footer className="mt-8 text-center text-[11px] leading-relaxed text-neutral-600">
        Photos and video stay in your browser session · nothing is stored ·
        realtime via <span className="font-mono text-neutral-500">lucy-vton-latest</span>{" "}
        · single-shot via <span className="font-mono text-neutral-500">lucy-image-2</span>
      </footer>
    </main>
  );
}
