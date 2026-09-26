import { NextResponse } from "next/server";
import { runTryOn } from "@/lib/decart";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/try-on
 * multipart/form-data: person (file), clothing (file), prompt? (string), resolution? (string)
 * Returns the generated image binary, or JSON { error } on failure.
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid request: expected multipart/form-data." },
      { status: 400 }
    );
  }

  const person = form.get("person");
  const clothing = form.get("clothing");
  const prompt = form.get("prompt");
  const resolution = form.get("resolution");

  if (!(person instanceof File) || person.size === 0) {
    return NextResponse.json(
      { error: "Missing person image. Add a photo first." },
      { status: 400 }
    );
  }
  if (!(clothing instanceof File) || clothing.size === 0) {
    return NextResponse.json(
      { error: "Missing clothing image. Pick or upload a garment first." },
      { status: 400 }
    );
  }
  if (!person.type.startsWith("image/") || !clothing.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "Invalid image: person and clothing must be image files." },
      { status: 400 }
    );
  }

  const result = await runTryOn({
    personImage: person,
    clothingImage: clothing,
    prompt: typeof prompt === "string" && prompt.trim() ? prompt : undefined,
    resolution:
      resolution === "480p" ? "480p" : resolution === "720p" ? "720p" : undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return new NextResponse(result.blob, {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "X-Mock-Mode": result.mock ? "true" : "false",
      "Cache-Control": "no-store",
    },
  });
}
