# AI Try-On Playground

A minimal playground for testing the **Decart virtual try-on API** — now with **realtime live try-on** (your webcam, transformed frame-by-frame) plus the original single-shot photo mode.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Configure

Edit `.env.local`:

```bash
# Your Decart API key (https://platform.decart.ai)
DECART_API_KEY=your-api-key-here

# true  = mock mode: never calls Decart, no credits used
# false = real API calls (live try-on bills per second while connected)
DECART_MOCK=true
```

Start with `DECART_MOCK=true` to test the whole flow without spending credits, then flip to `false` once you're ready for real generations.

## Use it

### ⚡ Live Try-On (default tab)

Realtime try-on over **WebRTC** using Decart's `lucy-vton-latest` model:

1. Click a garment (or just press **Start Live Session**).
2. Your camera streams to Decart and the edited stream — you wearing the garment — comes straight back into the page.
3. Click other garments to switch instantly, no reconnect.
4. **Remove garment** returns to the plain camera feed; **Stop Session** ends the billing.

Your API key never reaches the browser: the frontend fetches a short-lived client token (10 min TTL, scoped to `lucy-vton-latest`) from `POST /api/token`, which mints it server-side via the Decart SDK.

### 📷 Photo Try-On

The original single-shot flow (`lucy-image-2`):

1. **Your Photo** — capture from camera or upload.
2. **Clothing** — pick a preset or upload your own garment image.
3. **✨ Generate Try-On** → result image, with Try Again / Download.

## Mock mode behavior

| Mode | What you see |
|---|---|
| Photo | Random image from `public/mock-results/` as the "generated" output |
| Live | Your real camera feed; picking a garment applies a hue-shift filter stand-in |

No Decart calls are made in mock mode — token minting is short-circuited too.

## Replacing the placeholder clothing images

Drop your own images into [`public/clothes/`](public/clothes/) using the same filenames:

```
black-tshirt.png  white-tshirt.png  blue-tshirt.png
hoodie.png        jacket.png        shirt.png
```

Any square image ≥512×512 with a clean background works best. Labels and the per-garment try-on prompts live in the `CLOTHES` array in [`lib/clothes.ts`](lib/clothes.ts) — good prompts describe color, material, and fit (e.g. *"Substitute the current top with a black leather bomber jacket with ribbed cuffs"*).

## How it works

```
Browser
  ├─ components/live-tryon.tsx        (⚡ Live tab)
  │    ├─ POST /api/token             → short-lived client token (ek_…)
  │    └─ WebRTC ⇄ Decart edge        lucy-vton-latest
  │         camera stream in → edited stream out
  │         setImage(garment, prompt) switches garments mid-session
  │
  └─ components/photo-tryon.tsx       (📷 Photo tab)
       └─ POST /api/try-on            app/api/try-on/route.ts
            └─ lib/decart.ts          POST lucy-image-2 (server-side, x-api-key)
                 → generated image binary
```

All Decart-specific server code lives in [`lib/decart.ts`](lib/decart.ts) (photo) and `app/api/token/route.ts` (live token minting). Realtime wiring follows the [Decart realtime docs](https://docs.platform.decart.ai/models/realtime/video-editing) and their [try-on examples](https://github.com/DecartAI/tryon-examples).

Notes:
- Photos/video are held only in memory — nothing is persisted.
- Camera streams and WebRTC sessions are stopped when you stop the session, close the tab, or unload the page.
- Live sessions bill per second while connected — watch the LIVE timer.
- Client tokens expire after 10 minutes; active WebRTC sessions keep working past expiry, but start a new session after that.
