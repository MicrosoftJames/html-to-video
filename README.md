# HTML animation → video

A deterministic, frame-perfect pipeline for turning an AI-generated HTML/JS/SVG/canvas
animation into an MP4 you can drop into a YouTube video.

![Matrix-style binary counter rendered by this pipeline](demo.gif)

> Above: a 1-D 10-bit register counting 0 → 1000 (LSB on the right), rendered with
> this pipeline and exported to GIF.

## How it works

1. `animation.html` draws your animation as a **pure function of time** — it exposes
   `window.__renderFrame(t)` where `t` is seconds elapsed.
2. `render.js` launches headless Chromium (via `puppeteer-core`), calls `__renderFrame(t)`
   for each frame at a fixed FPS, screenshots every frame, and pipes them into **ffmpeg**.
3. Because *we* control `t`, the output is frame-perfect — it never drops frames and
   doesn't depend on how fast the machine renders.

## Requirements (already present on this machine)

- Node.js, ffmpeg, and Chromium (`/usr/bin/chromium-browser`).
- If Chromium lives elsewhere, set `CHROME_PATH=/path/to/chrome`.

## Usage

```bash
npm install                       # one-time
node render.js                    # uses defaults: 6s, 60fps, out.mp4
node render.js --duration 8 --fps 60 --out intro.mp4
node render.js --html my-anim.html --duration 4 --fps 30
```

Flags: `--duration` (seconds), `--fps`, `--out`, `--html`.

Preview live while editing: just open `animation.html` in a normal browser.

## Writing the animation (or prompting an AI to)

Tell your AI assistant:

> Edit `animation.html` so the canvas animation is driven entirely by a single
> `t` (seconds) variable inside `drawFrame(t)`. Don't use `Date.now()`, CSS
> animations, or random values — every frame must be reproducible from `t`.
> Keep the `window.__renderFrame = (t) => drawFrame(t)` hook.

That single rule (animation = `f(t)`) is what makes the capture deterministic.

## YouTube tips

- Render at the resolution you'll publish (change the `<canvas width/height>` and the
  viewport follows automatically). 1920×1080 @ 60fps is a safe choice.
- Output is H.264 / yuv420p / `+faststart` — directly uploadable.
- Need a transparent overlay instead? Render to a `.mov` with alpha by swapping the
  ffmpeg codec to `prores_ks -pix_fmt yuva444p10le` and screenshotting with
  `omitBackground: true`.

## Exporting a GIF (e.g. for this README)

GIFs render inline on GitHub. Use a palette for clean colors:

```bash
ffmpeg -y -i matrix-binary.mp4 \
  -vf "fps=15,scale=600:-1:flags=lanczos,palettegen=stats_mode=diff" palette.png
ffmpeg -y -i matrix-binary.mp4 -i palette.png \
  -lavfi "fps=15,scale=600:-1:flags=lanczos,paletteuse=dither=bayer:bayer_scale=4" demo.gif
```

Lower `fps`/`scale` to shrink the file. MP4 looks better and is smaller, but isn't
committed to the repo — a GIF is the dependable choice for a README demo.

## Files

- `animation.html` — your animation (sample: orbiting colored dots + title).
- `render.js` — the capture + encode script.
