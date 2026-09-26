"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import { CLOTHES } from "@/lib/clothes";

type Source = "none" | "camera" | "upload";
type Status = "idle" | "loading" | "done" | "error";

/**
 * Single-shot photo try-on (lucy-image-2): capture/upload a photo, pick a
 * garment, generate once. The realtime experience lives in live-tryon.tsx.
 */
export default function PhotoTryOn() {
  // --- Person image state ---
  const [source, setSource] = useState<Source>("none");
  const [personPreview, setPersonPreview] = useState<string | null>(null);
  const [personFile, setPersonFile] = useState<File | null>(null);

  // --- Camera state ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // --- Clothing state ---
  const [selectedClothing, setSelectedClothing] = useState<string | null>(null); // filename of preset
  const [uploadedClothing, setUploadedClothing] = useState<{
    url: string;
    file: File;
  } | null>(null);

  // --- Generate state ---
  const [status, setStatus] = useState<Status>("idle");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultWasMock, setResultWasMock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // ---------- Camera ----------

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const openCamera = useCallback(async () => {
    setCameraError(null);
    setPersonPreview(null);
    setPersonFile(null);
    setSource("camera");

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "Camera not supported in this browser. Use Upload Photo instead."
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError") {
        setCameraError(
          "Camera permission denied. Allow camera access in your browser settings, or use Upload Photo."
        );
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setCameraError("No camera found on this device. Use Upload Photo instead.");
      } else {
        setCameraError(
          `Could not start camera${err instanceof Error ? `: ${err.message}` : ""}. Use Upload Photo instead.`
        );
      }
      setSource("none");
    }
  }, []);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
        setPersonFile(file);
        setPersonPreview(URL.createObjectURL(blob));
        stopCamera();
        // "upload" state doubles as the captured-photo preview (with Retake)
        setSource("upload");
      },
      "image/jpeg",
      0.92
    );
  }, [stopCamera]);

  const retake = useCallback(() => {
    setPersonPreview(null);
    setPersonFile(null);
    void openCamera();
  }, [openCamera]);

  const closeCamera = useCallback(() => {
    stopCamera();
    setSource("none");
  }, [stopCamera]);

  // ---------- Uploads ----------

  const onPersonUpload = useCallback((files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Invalid image: please choose a JPG, PNG, or WebP photo.");
      return;
    }
    setError(null);
    stopCamera();
    setPersonFile(file);
    setPersonPreview(URL.createObjectURL(file));
    setSource("upload");
  }, [stopCamera]);

  const onClothingUpload = useCallback((files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Invalid image: please choose a JPG, PNG, or WebP garment image.");
      return;
    }
    setError(null);
    setSelectedClothing(null);
    setUploadedClothing({ url: URL.createObjectURL(file), file });
  }, []);

  // ---------- Generate ----------

  const canGenerate =
    personFile !== null &&
    (selectedClothing !== null || uploadedClothing !== null) &&
    status !== "loading";

  const generate = useCallback(async () => {
    if (!personFile) return;
    let clothing: File | null = uploadedClothing?.file ?? null;
    let prompt = "Substitute the current top with the garment in the reference image. Keep the person's face, pose, body shape, and background unchanged.";
    if (!clothing && selectedClothing) {
      const preset = CLOTHES.find((c) => c.file === selectedClothing);
      if (preset) prompt = preset.prompt;
      const res = await fetch(`/clothes/${selectedClothing}`);
      if (!res.ok) throw new Error(`Could not load clothing image (${selectedClothing}).`);
      clothing = new File([await res.blob()], selectedClothing, {
        type: res.headers.get("content-type") || "image/png",
      });
    }
    if (!clothing) return;

    setStatus("loading");
    setError(null);
    setResultUrl(null);
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - started), 200);

    try {
      const form = new FormData();
      form.append("person", personFile);
      form.append("clothing", clothing);
      form.append("prompt", prompt);

      const res = await fetch("/api/try-on", { method: "POST", body: form });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Request failed (${res.status})`);
      }
      const contentType = res.headers.get("content-type") || "image/png";
      const blob = await res.blob();
      setResultUrl(URL.createObjectURL(new Blob([blob], { type: contentType })));
      setResultWasMock(res.headers.get("X-Mock-Mode") === "true");
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
      setStatus("error");
    } finally {
      clearInterval(timer);
    }
  }, [personFile, uploadedClothing, selectedClothing]);

  const download = useCallback(() => {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = "tryon-result.png";
    a.click();
  }, [resultUrl]);

  // ---------- Render ----------

  return (
    <div>
      {/* Two-column workspace */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* 1. Person Image */}
        <section className="rounded-xl border border-border bg-surface p-3 sm:p-5">
          <h2 className="mb-4 font-mono text-sm font-semibold tracking-widest text-neutral-300">
            YOUR PHOTO
          </h2>

          {source === "none" && (
            <div className="flex flex-col gap-3">
              <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-border text-sm text-neutral-500">
                No photo yet
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => void openCamera()}
                  className="rounded-lg border border-border bg-neutral-900 px-3 py-2.5 text-sm font-medium transition hover:border-accent hover:text-accent"
                >
                  📷 Open Camera
                </button>
                <label className="cursor-pointer rounded-lg border border-border bg-neutral-900 px-3 py-2.5 text-center text-sm font-medium transition hover:border-accent hover:text-accent">
                  📁 Upload Photo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onPersonUpload(e.target.files)}
                  />
                </label>
              </div>
            </div>
          )}

          {source === "camera" && (
            <div className="flex flex-col gap-3">
              {cameraError ? (
                <div className="flex h-56 items-center justify-center rounded-lg border border-red-900/50 bg-red-950/30 px-4 text-center text-sm text-red-300">
                  {cameraError}
                </div>
              ) : (
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className="h-56 w-full rounded-lg border border-border object-cover [transform:scaleX(-1)]"
                />
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={capture}
                  disabled={!!cameraError}
                  className="rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-40"
                >
                  ⦿ Capture
                </button>
                <button
                  onClick={closeCamera}
                  className="rounded-lg border border-border px-3 py-2.5 text-sm font-medium transition hover:border-neutral-500"
                >
                  ✕ Close Camera
                </button>
              </div>
            </div>
          )}

          {source === "upload" && personPreview && (
            <div className="flex flex-col gap-3">
              <img
                src={personPreview}
                alt="Your photo"
                className="h-56 w-full rounded-lg border border-border object-cover"
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={retake}
                  className="rounded-lg border border-border px-3 py-2.5 text-sm font-medium transition hover:border-accent hover:text-accent"
                >
                  ↺ Retake
                </button>
                <label className="cursor-pointer rounded-lg border border-border bg-neutral-900 px-3 py-2.5 text-center text-sm font-medium transition hover:border-accent hover:text-accent">
                  📁 Change Photo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onPersonUpload(e.target.files)}
                  />
                </label>
              </div>
            </div>
          )}
        </section>

        {/* 2. Clothing */}
        <section className="rounded-xl border border-border bg-surface p-3 sm:p-5">
          <h2 className="mb-4 font-mono text-sm font-semibold tracking-widest text-neutral-300">
            CLOTHING
          </h2>

          <div className="grid grid-cols-3 gap-2">
            {CLOTHES.map((c) => {
              const active = selectedClothing === c.file;
              return (
                <button
                  key={c.file}
                  onClick={() => {
                    setSelectedClothing(c.file);
                    setUploadedClothing(null);
                  }}
                  className={`group relative overflow-hidden rounded-lg border transition ${
                    active
                      ? "border-accent ring-2 ring-accent/40"
                      : "border-border hover:border-neutral-500"
                  }`}
                  title={c.label}
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
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {uploadedClothing && (
            <div className="mt-3 rounded-lg border border-accent/60 p-2">
              <div className="flex items-center gap-3">
                <img
                  src={uploadedClothing.url}
                  alt="Uploaded clothing"
                  className="h-14 w-14 rounded border border-border bg-neutral-900 object-contain"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-accent">
                    ✓ Custom garment selected
                  </p>
                  <p className="truncate text-[11px] text-neutral-500">
                    {uploadedClothing.file.name}
                  </p>
                </div>
                <button
                  onClick={() => setUploadedClothing(null)}
                  className="text-xs text-neutral-500 hover:text-red-400"
                >
                  Remove
                </button>
              </div>
            </div>
          )}

          <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm font-medium text-neutral-300 transition hover:border-accent hover:text-accent">
            ＋ Upload Clothing
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onClothingUpload(e.target.files)}
            />
          </label>
        </section>
      </div>

      {/* 3. Generate */}
      <div className="mt-6 flex flex-col items-center gap-3">
        <button
          onClick={() => void generate()}
          disabled={!canGenerate}
          className="w-full rounded-xl bg-accent px-6 py-4 font-mono text-base font-bold tracking-wide text-white shadow-lg shadow-accent/20 transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:min-w-96"
        >
          {status === "loading" ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Generating… {elapsed > 0 ? `${(elapsed / 1000).toFixed(1)}s` : ""}
            </span>
          ) : (
            "✨ Generate Try-On"
          )}
        </button>

        {error && (
          <div className="w-full rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            ⚠ {error}
          </div>
        )}
      </div>

      {/* Result */}        <section className="mt-6 rounded-xl border border-border bg-surface p-3 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-mono text-sm font-semibold tracking-widest text-neutral-300">
            RESULT
          </h2>
          {status === "done" && resultWasMock && (
            <span className="rounded-full border border-amber-800/60 bg-amber-950/40 px-2 py-0.5 text-[11px] font-medium text-amber-300">
              MOCK — no credits used
            </span>
          )}
        </div>

        {status === "idle" && (
          <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-border text-sm text-neutral-500">
            Your generated try-on will appear here
          </div>
        )}

        {status === "loading" && (
          <div className="flex h-72 flex-col items-center justify-center gap-3 rounded-lg border border-border">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
            <p className="text-sm text-neutral-400">
              Dressing the person… this usually takes 10–30s
            </p>
          </div>
        )}

        {status === "done" && resultUrl && (
          <div className="flex flex-col items-center gap-4">
            <img
              src={resultUrl}
              alt="Try-on result"
              className="max-h-[480px] max-w-full rounded-lg border border-border object-contain"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setStatus("idle");
                  setResultUrl(null);
                }}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:border-accent hover:text-accent"
              >
                ↺ Try Again
              </button>
              <button
                onClick={download}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover"
              >
                ⬇ Download Result
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
