/**
 * Decart API integration.
 *
 * Endpoint (from https://docs.platform.decart.ai/api-reference/lucy-image-2):
 *   POST https://api.decart.ai/v1/generate/lucy-image-2
 *   Headers:  x-api-key: <DECART_API_KEY>
 *   Body:     multipart/form-data
 *     - data            (file, required)      person image to edit
 *     - reference_image (file, optional)      garment reference
 *     - prompt          (string, required)    edit instruction
 *     - resolution      (string, default 720p) "720p" | "480p"
 *     - enhance_prompt  (boolean, default true)
 *   Response: the generated image file (binary)
 *
 * Mock mode: set DECART_MOCK=true to skip Decart entirely and return a
 * random image from /public/mock-results (no credits consumed).
 */

export const DECART_IMAGE_MODEL = "lucy-image-2";

/** Default instruction used for try-on edits. */
export const TRY_ON_PROMPT =
  "Substitute the current top with the clothing item shown in the reference image. Keep the person's face, pose, body shape, and background unchanged.";

const DECART_BASE_URL = "https://api.decart.ai/v1";

/** Prompt presets the user can cycle through from the playground. */
export const PROMPT_PRESETS = [
  "Substitute the current top with the clothing item shown in the reference image. Keep the person's face, pose, body shape, and background unchanged.",
  "Substitute the current top with a garment identical to the reference image. Preserve the person's identity, pose, and background.",
  "Dress the person in the garment from the reference image, matching its color, texture, and fit. Keep everything else in the photo the same.",
];

export interface TryOnRequest {
  personImage: File;
  clothingImage: File;
  prompt?: string;
  resolution?: "720p" | "480p";
}

export interface TryOnSuccess {
  ok: true;
  blob: Blob;
  contentType: string;
  mock: boolean;
}

export interface TryOnFailure {
  ok: false;
  error: string;
}

/**
 * Run a virtual try-on. Returns the generated image as a Blob.
 * Returns { ok: false, error } instead of throwing so the route can map
 * failures to clean JSON responses.
 */
export async function runTryOn(
  input: TryOnRequest
): Promise<TryOnSuccess | TryOnFailure> {
  const mock = process.env.DECART_MOCK === "true";

  if (mock) {
    return mockTryOn();
  }

  const apiKey = process.env.DECART_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error:
        "DECART_API_KEY is not set. Add it to .env.local (or enable DECART_MOCK=true for testing without credits).",
    };
  }

  const form = new FormData();
  form.append("data", input.personImage, input.personImage.name || "person.jpg");
  form.append(
    "reference_image",
    input.clothingImage,
    input.clothingImage.name || "garment.jpg"
  );
  form.append("prompt", input.prompt || TRY_ON_PROMPT);
  form.append("resolution", input.resolution || "720p");

  let res: Response;
  try {
    res = await fetch(
      `${DECART_BASE_URL}/generate/${DECART_IMAGE_MODEL}`,
      {
        method: "POST",
        headers: { "x-api-key": apiKey },
        body: form,
      }
    );
  } catch (err) {
    return {
      ok: false,
      error: `Could not reach the Decart API: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      error: `Decart API error ${res.status}: ${await readError(res)}`,
    };
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    // Decart returns validation errors as JSON with 200 in some cases; guard against it.
    const text = await res.text();
    return {
      ok: false,
      error: `Decart returned a non-image response (${contentType || "unknown type"}): ${truncate(text, 300)}`,
    };
  }

  const blob = await res.blob();
  if (blob.size === 0) {
    return { ok: false, error: "Decart returned an empty image." };
  }

  return { ok: true, blob, contentType, mock: false };
}

/** Pick a random mock result image to serve as the fake generation output. */
async function mockTryOn(): Promise<TryOnSuccess | TryOnFailure> {
  const { readdir, readFile } = await import("node:fs/promises");
  const path = await import("node:path");

  const dir = path.join(process.cwd(), "public", "mock-results");
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) =>
      /\.(png|jpe?g|webp|gif)$/i.test(f)
    );
  } catch {
    return {
      ok: false,
      error:
        'Mock mode is on but /public/mock-results is empty or missing. Add an image there or set DECART_MOCK=false.',
    };
  }

  if (files.length === 0) {
    return {
      ok: false,
      error:
        'Mock mode is on but /public/mock-results has no images. Add an image there or set DECART_MOCK=false.',
    };
  }

  const chosen = files[Math.floor(Math.random() * files.length)];
  const buffer = await readFile(path.join(dir, chosen));
  const ext = path.extname(chosen).toLowerCase();
  const contentType =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".gif"
          ? "image/gif"
          : "image/jpeg";

  // Small artificial delay so the loading state is visible, like a real call.
  await new Promise((r) => setTimeout(r, 1200));

  return {
    ok: true,
    blob: new Blob([new Uint8Array(buffer)], { type: contentType }),
    contentType,
    mock: true,
  };
}

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  if (!text) return res.statusText || "request failed";
  try {
    const json = JSON.parse(text);
    if (json.detail) {
      if (typeof json.detail === "string") return json.detail;
      if (Array.isArray(json.detail)) {
        return json.detail
          .map(
            (d: { loc?: string[]; msg?: string }) =>
              `${d.loc?.join(".") || "field"}: ${d.msg || "invalid"}`
          )
          .join("; ");
      }
    }
    return truncate(text, 300);
  } catch {
    return truncate(text, 300);
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
