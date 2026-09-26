"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createDecartClient,
  models,
  resolveFpsNumber,
  type RealTimeClient,
} from "@decartai/sdk";
import { CLOTHES } from "@/lib/clothes";

type SessionState = "idle" | "starting" | "live";
type GarmentStatus = "none" | "sending" | "applied";

interface Garment {
  id: string;
  label: string;
  file: File;
  prompt: string;
}

async function loadPresetFile(filename: string): Promise<File> {
  const res = await fetch(`/clothes/${filename}`);
  if (!res.ok) throw new Error(`Could not load preset garment (${filename}).`);
  return new File([await res.blob()], filename, {
    type: res.headers.get("content-type") || "image/png",
  });
}

/** Default instruction for user-uploaded garments (editable in the UI). */
const DEFAULT_CUSTOM_PROMPT =
  "Substitute the current top with the garment shown in the reference image, matching its color, material, texture, and fit";

/** True unless this browser is missing WebRTC/getUserMedia entirely. */
function realtimeAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof RTCPeerConnection !== "undefined"
  );
}

/**
 * Realtime try-on: your live camera is streamed to Decart's lucy-vton-latest
 * model over WebRTC and the edited stream (you wearing the garment) comes
 * straight back. Switch garments any time — no reconnect, no re-upload.
 */
export default function LiveTryOn() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const rtClientRef = useRef<RealTimeClient | null>(null);

  const [session, setSession] = useState<SessionState>("idle");
  const [connState, setConnState] = useState<string>("idle");
  const [mock, setMock] = useState(false);
  const [garment, setGarment] = useState<Garment | null>(null);
  const [garmentStatus, setGarmentStatus] = useState<GarmentStatus>("none");
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [mirror, setMirror] = useState(true);

  // --- Custom uploaded garment ---
  const [customGarment, setCustomGarment] = useState<
    (Garment & { url: string }) | null
  >(null);
  const [customPrompt, setCustomPrompt] = useState("");

  // Garment chosen before the connection finishes — apply it on connect.
  const pendingRef = useRef<Garment | null>(null);
  const mockRef = useRef(false);

  const stopEverything = useCallback(() => {
    rtClientRef.current?.disconnect();
    rtClientRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
  }, []);

  // Stop camera + WebRTC session when the tab unmounts or page closes.
  useEffect(() => {
    const stop = () => stopEverything();
    window.addEventListener("beforeunload", stop);
    return () => {
      window.removeEventListener("beforeunload", stop);
      stopEverything();
      setCustomGarment((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return null;
      });
    };
  }, [stopEverything]);

  const applyGarment = useCallback(async (g: Garment) => {
    const client = rtClientRef.current;
    if (!client) return;
    setGarmentStatus("sending");
    try {
      await client.setImage(g.file, { prompt: g.prompt, enhance: true });
      setGarmentStatus("applied");
    } catch (err) {
      setGarmentStatus("none");
      setError(
        `Could not apply garment: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    if (!realtimeAvailable()) {
      setError(
        "Live try-on needs WebRTC, which this browser doesn't support. Try Chrome or Edge."
      );
      return;
    }

    setSession("starting");
    setConnState("connecting");
    setGarmentStatus("none");
    setSeconds(0);

    // 1. Get a short-lived client token (or mock flag) from our server.
    let apiKey: string | null = null;
    try {
      const res = await fetch("/api/token", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Token request failed (${res.status})`);
      if (data.mock) {
        mockRef.current = true;
        setMock(true);
      } else {
        apiKey = data.apiKey as string;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not get client token.");
      setSession("idle");
      return;
    }

    // 2. Open the camera at the model's native resolution/fps.
    const model = models.realtime("lucy-vton-latest");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: model.width },
          height: { ideal: model.height },
          frameRate: { ideal: resolveFpsNumber(model.fps) },
        },
        audio: false,
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      setError(
        name === "NotAllowedError"
          ? "Camera permission denied. Allow camera access and try again."
          : name === "NotFoundError"
            ? "No camera found on this device."
            : `Could not start camera: ${err instanceof Error ? err.message : String(err)}`
      );
      setSession("idle");
      return;
    }
    localStreamRef.current = stream;

    // ---- Mock mode: no credits, no WebRTC. The "AI output" is just the raw
    // camera feed; picking a garment applies a CSS filter as a stand-in so the
    // whole flow (connect → select → clear → stop) can be tested for free.
    if (mockRef.current) {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setConnState("connected");
      setSession("live");
      const pending = pendingRef.current;
      if (pending) {
        pendingRef.current = null;
        setGarment(pending);
        setGarmentStatus("applied");
      }
      return;
    }

    // 3. Real session: stream camera → Decart, show the edited stream.
    try {
      const client = createDecartClient({ apiKey: apiKey! });
      const rt = await client.realtime.connect(stream, {
        model,
        mirror: "auto",
        initialState: { passthrough: true }, // raw feed until first garment lands
        onRemoteStream: (remote) => {
          if (videoRef.current) {
            videoRef.current.srcObject = remote;
            void videoRef.current.play().catch(() => {});
          }
        },
        onConnectionChange: (state) => {
          setConnState(state);
          if (state === "connected") {
            setSession("live");
            const pending = pendingRef.current;
            if (pending) {
              pendingRef.current = null;
              setGarment(pending);
              void applyGarment(pending);
            }
          }
          if (state === "disconnected" || state === "reconnecting") {
            setGarmentStatus("none");
          }
        },
      });
      rtClientRef.current = rt;
      rt.on("error", (e) =>
        setError(e instanceof Error ? e.message : String(e))
      );
      rt.on("generationTick", (t) => setSeconds(t.seconds));
      rt.on("sessionEnded", (s) => {
        stopEverything();
        setSession("idle");
        setConnState("idle");
        setGarmentStatus("none");
        setError(`Session ended by the server (${s.reason}).`);
      });
    } catch (err) {
      stopEverything();
      setError(
        `Could not start live try-on: ${err instanceof Error ? err.message : String(err)}`
      );
      setSession("idle");
    }
  }, [applyGarment, stopEverything]);

  const stop = useCallback(() => {
    stopEverything();
    setSession("idle");
    setConnState("idle");
    setGarment(null);
    setGarmentStatus("none");
    setSeconds(0);
  }, [stopEverything]);

  const selectGarment = useCallback(
    async (g: Garment) => {
      setError(null);
      if (session === "live" && (connState === "connected" || connState === "generating")) {
        setGarment(g);
        if (mockRef.current) {
          setGarmentStatus("applied");
        } else {
          await applyGarment(g);
        }
      } else {
        // Not live yet — remember it and auto-connect.
        pendingRef.current = g;
        setGarment(g);
        setGarmentStatus("sending");
        if (session === "idle") void connect();
      }
    },
    [session, connState, applyGarment, connect]
  );

  const pickGarment = useCallback(
    async (c: (typeof CLOTHES)[number]) => {
      try {
        const file = await loadPresetFile(c.file);
        await selectGarment({
          id: `preset:${c.file}`,
          label: c.label,
          file,
          prompt: c.prompt,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [selectGarment]
  );

  const onGarmentUpload = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setError("Invalid image: please choose a JPG, PNG, or WebP garment image.");
        return;
      }
      if (file.size > 15 * 1024 * 1024) {
        setError("Garment image is too large (max 15MB).");
        return;
      }
      setError(null);
      const url = URL.createObjectURL(file);
      const g: Garment = {
        id: "custom",
        label: file.name.replace(/\.[^.]+$/, "") || "Your garment",
        file,
        prompt: DEFAULT_CUSTOM_PROMPT,
      };
      setCustomGarment((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { ...g, url };
      });
      setCustomPrompt(g.prompt);
      // Select (and connect, if needed) right away — same flow as presets.
      void selectGarment(g);
    },
    [selectGarment]
  );

  const clearGarment = useCallback(async () => {
    pendingRef.current = null;
    setGarment(null);
    setGarmentStatus("none");
    if (mockRef.current) return;
    try {
      await rtClientRef.current?.setImage(null);
    } catch {
      // clearing is best-effort
    }
  }, []);

  const removeCustomGarment = useCallback(() => {
    setCustomGarment((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setCustomPrompt("");
    if (garment?.id === "custom") void clearGarment();
  }, [garment, clearGarment]);

  const applyCustomPrompt = useCallback(async () => {
    if (!customGarment || !customPrompt.trim()) return;
    const updated: Garment = { ...customGarment, prompt: customPrompt.trim() };
    setCustomGarment({ ...updated, url: customGarment.url });
    setGarment(updated);
    const liveConnected =
      session === "live" && (connState === "connected" || connState === "generating");
    if (mockRef.current || !liveConnected) {
      // Not streaming yet (or mock mode) — just update what gets applied.
      pendingRef.current = updated;
      return;
    }
    await applyGarment(updated);
  }, [customGarment, customPrompt, session, connState, applyGarment]);

  const live = session === "live";
  const busy = session === "starting";
  const active = garmentStatus === "applied";

  // ---------- Render ----------

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-5">
        {/* Live output */}
        <section className="rounded-xl border border-border bg-surface p-3 sm:p-5 md:col-span-3">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-mono text-sm font-semibold tracking-widest text-neutral-300">
              LIVE OUTPUT
            </h2>
            <div className="flex items-center gap-2">
              {mock && live && (
                <span className="rounded-full border border-amber-800/60 bg-amber-950/40 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                  MOCK — no credits used
                </span>
              )}
              {live && connState === "connected" && (
                <span className="flex items-center gap-1.5 rounded-full border border-green-800/60 bg-green-950/40 px-2 py-0.5 text-[11px] font-medium text-green-300">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
                  LIVE {seconds > 0 ? `· ${seconds}s` : ""}
                </span>
              )}
              {(connState === "connecting" || connState === "reconnecting") && (
                <span className="flex items-center gap-1.5 rounded-full border border-amber-800/60 bg-amber-950/40 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                  {connState}
                </span>
              )}
              {connState === "disconnected" && (
                <span className="rounded-full border border-red-800/60 bg-red-950/40 px-2 py-0.5 text-[11px] font-medium text-red-300">
                  disconnected
                </span>
              )}
              {live && (
                <button
                  onClick={() => setMirror((m) => !m)}
                  className="rounded border border-border px-2 py-0.5 text-[11px] text-neutral-400 transition hover:border-accent hover:text-accent"
                  title="Mirror / unmirror the output"
                >
                  ⇄ mirror
                </button>
              )}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-lg border border-border bg-neutral-950">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className={`aspect-[3/4] w-full object-cover transition-[filter] duration-500 sm:aspect-[16/9] ${
                mirror ? "[transform:scaleX(-1)]" : ""
              } ${mock && active ? "mock-mirror" : ""}`}
            />
            {!live && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-950/80 px-6 text-center">
                {busy ? (
                  <>
                    <span className="h-8 w-8 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
                    <p className="text-sm text-neutral-300">
                      Connecting to the live model…
                    </p>
                    <p className="text-xs text-neutral-500">
                      Allow camera access if your browser asks
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-neutral-400">
                      Session stopped — press a garment to go live again
                    </p>
                    <button
                      onClick={() => void connect()}
                      className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover"
                    >
                      ▶ Start Live Session
                    </button>
                  </>
                )}
              </div>
            )}
            {live && !garment && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs text-neutral-300 backdrop-blur">
                Pick a garment to dress up →
              </div>
            )}
            {live && garmentStatus === "sending" && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1 text-xs text-neutral-300 backdrop-blur">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
                Applying {garment?.label}…
              </div>
            )}
          </div>

          {error && (
            <div className="mt-3 rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
              ⚠ {error}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-600">
            <span>
              live camera → <span className="font-mono text-neutral-500">lucy-vton-latest</span>{" "}
              over WebRTC · billed per second while live
            </span>
            {live && (
              <button
                onClick={stop}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-neutral-300 transition hover:border-red-500 hover:text-red-400"
              >
                ■ Stop Session
              </button>
            )}
          </div>
        </section>

        {/* Garment picker */}
        <section className="rounded-xl border border-border bg-surface p-3 sm:p-5 md:col-span-2">
          <h2 className="mb-4 font-mono text-sm font-semibold tracking-widest text-neutral-300">
            GARMENT
          </h2>

          <div className="grid grid-cols-3 gap-2">
            {CLOTHES.map((c) => {
              const active = garment?.id === `preset:${c.file}`;
              return (
                <button
                  key={c.file}
                  onClick={() => void pickGarment(c)}
                  disabled={busy}
                  className={`group relative overflow-hidden rounded-lg border transition disabled:opacity-50 ${
                    active
                      ? "border-accent ring-2 ring-accent/40"
                      : "border-border hover:border-neutral-500"
                  }`}
                  title={c.prompt}
                >
                  <img
                    src={`/clothes/${c.file}`}
                    alt={c.label}
                    className="aspect-square w-full bg-neutral-900 object-contain p-1.5"
                  />
                  <span className="block truncate px-1 pb-1.5 text-[11px] text-neutral-400">
                    {c.label}
                  </span>
                  {active && (
                    <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
                      {garmentStatus === "sending" ? "…" : "✓"}
                    </span>
                  )}
                </button>
              );
            })}

            {customGarment && (
              <button
                key="custom-garment"
                onClick={() => void selectGarment(customGarment)}
                disabled={busy}
                className={`group relative overflow-hidden rounded-lg border transition disabled:opacity-50 ${
                  garment?.id === customGarment.id
                    ? "border-accent ring-2 ring-accent/40"
                    : "border-border hover:border-neutral-500"
                }`}
                title="Your uploaded garment"
              >
                <img
                  src={customGarment.url}
                  alt="Uploaded garment"
                  className="aspect-square w-full bg-neutral-900 object-contain p-1.5"
                />
                <span className="block truncate px-1 pb-1.5 text-[11px] text-neutral-400">
                  {customGarment.label}
                </span>
                {garment?.id === customGarment.id && (
                  <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
                    {garmentStatus === "sending" ? "…" : "✓"}
                  </span>
                )}
              </button>
            )}

            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-neutral-500 transition hover:border-accent hover:text-accent">
              <span className="text-lg leading-none">＋</span>
              <span className="px-1 pb-1.5 text-center text-[10px] leading-tight">
                Upload your own
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  onGarmentUpload(e.target.files);
                  e.currentTarget.value = "";
                }}
              />
            </label>
          </div>

          {garment?.id === "custom" && customGarment && (
            <div className="mt-3 rounded-lg border border-accent/60 p-2">
              <div className="flex items-center gap-2">
                <img
                  src={customGarment.url}
                  alt="Uploaded garment"
                  className="h-10 w-10 rounded border border-border bg-neutral-900 object-contain"
                />
                <p className="min-w-0 flex-1 truncate text-xs font-medium text-accent">
                  ✓ {customGarment.label}
                </p>
                <button
                  onClick={removeCustomGarment}
                  className="text-xs text-neutral-500 hover:text-red-400"
                  title="Delete this garment"
                >
                  ✕
                </button>
              </div>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                rows={2}
                placeholder="Describe how to apply this garment…"
                className="mt-2 w-full resize-none rounded border border-border bg-neutral-950 px-2 py-1.5 text-[11px] text-neutral-200 placeholder-neutral-600 focus:border-accent focus:outline-none"
              />
              <button
                onClick={() => void applyCustomPrompt()}
                disabled={garmentStatus === "sending" || !customPrompt.trim()}
                className="mt-1.5 w-full rounded bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent-hover disabled:opacity-40"
              >
                ↻ Re-apply with this prompt
              </button>
            </div>
          )}

          {garment && (
            <button
              onClick={() => void clearGarment()}
              className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-xs font-medium text-neutral-400 transition hover:border-neutral-500 hover:text-neutral-200"
            >
              ✕ Remove garment — back to plain camera
            </button>
          )}

          <div className="mt-4 rounded-lg border border-border bg-neutral-950/60 p-3 text-[11px] leading-relaxed text-neutral-500">
            <p className="mb-1 font-mono text-neutral-400 text-[11px]">HOW IT WORKS</p>
            Pick a garment — or upload your own — and the app connects to
            Decart&apos;s realtime try-on model and streams you wearing it. Click
            other garments to switch instantly — no reconnect, no waiting. For
            uploads, a clean shot of the garment on a plain background works best.
          </div>
        </section>
      </div>
    </div>
  );
}
