import { NextResponse } from "next/server";
import { createDecartClient, models } from "@decartai/sdk";

export const runtime = "nodejs";

/**
 * POST /api/token
 * Mints a short-lived Decart client token so the browser can open a realtime
 * WebRTC session without ever seeing the permanent DECART_API_KEY.
 *
 * Mock mode: returns { mock: true } so the client uses the local mirror demo.
 */
export async function POST() {
  if (process.env.DECART_MOCK === "true") {
    return NextResponse.json({ mock: true });
  }

  const apiKey = process.env.DECART_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "DECART_API_KEY is not set. Add it to .env.local (or enable DECART_MOCK=true for testing without credits).",
      },
      { status: 500 }
    );
  }

  try {
    const client = createDecartClient({ apiKey });
    const token = await client.tokens.create({
      expiresIn: 600, // 10 minutes — enough for a try-on session
      allowedModels: [models.realtime("lucy-vton-latest").name],
    });
    return NextResponse.json(token);
  } catch (err) {
    return NextResponse.json(
      {
        error: `Could not create Decart client token: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 502 }
    );
  }
}
