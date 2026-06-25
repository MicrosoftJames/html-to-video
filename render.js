#!/usr/bin/env node
/**
 * Deterministic HTML-animation -> video renderer.
 *
 * Loads animation.html in headless Chromium, calls window.__renderFrame(t)
 * for each frame at a fixed FPS, screenshots every frame, then pipes the
 * frames straight into ffmpeg to produce an MP4. Because WE control `t`,
 * the output is frame-perfect regardless of how fast rendering actually is.
 *
 * Usage:
 *   node render.js [--duration 6] [--fps 60] [--out out.mp4] [--html animation.html]
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// ---- Config (override via CLI flags) ----
function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const DURATION = parseFloat(arg('duration', '6'));   // seconds
const FPS = parseInt(arg('fps', '60'), 10);           // frames per second
const OUT = arg('out', 'out.mp4');
const HTML = arg('html', 'animation.html');
const CHROME = process.env.CHROME_PATH || '/usr/bin/chromium-browser';

const totalFrames = Math.round(DURATION * FPS);

(async () => {
  const puppeteer = (await import('puppeteer-core')).default;
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--force-color-profile=srgb'],
  });
  const page = await browser.newPage();

  // Flag so the HTML's live-preview loop stays off during capture.
  await page.evaluateOnNewDocument(() => { window.__capturing = true; });

  const fileUrl = 'file://' + path.resolve(HTML);
  await page.goto(fileUrl, { waitUntil: 'networkidle0' });

  // Match the viewport to the canvas so screenshots are exact.
  const size = await page.evaluate(() => {
    const c = document.querySelector('canvas') || document.body;
    return { w: c.width || c.clientWidth, h: c.height || c.clientHeight };
  });
  await page.setViewport({ width: size.w, height: size.h, deviceScaleFactor: 1 });

  const hasHook = await page.evaluate(() => typeof window.__renderFrame === 'function');
  if (!hasHook) {
    console.error('ERROR: animation.html must define window.__renderFrame(t).');
    await browser.close();
    process.exit(1);
  }

  // ---- Start ffmpeg, reading raw PNG frames from stdin ----
  const ff = spawn('ffmpeg', [
    '-y',
    '-f', 'image2pipe',
    '-framerate', String(FPS),
    '-i', '-',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-crf', '18',
    '-movflags', '+faststart',
    OUT,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });

  console.log(`Rendering ${totalFrames} frames @ ${FPS}fps (${DURATION}s) -> ${OUT}`);

  for (let frame = 0; frame < totalFrames; frame++) {
    const t = frame / FPS;
    await page.evaluate((time) => window.__renderFrame(time), t);
    const buf = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: size.w, height: size.h } });
    if (!ff.stdin.write(buf)) {
      await new Promise((res) => ff.stdin.once('drain', res));
    }
    if (frame % FPS === 0) process.stdout.write(`  frame ${frame}/${totalFrames}\r`);
  }

  ff.stdin.end();
  await new Promise((resolve, reject) => {
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error('ffmpeg exited ' + code))));
  });
  await browser.close();
  console.log(`\nDone -> ${path.resolve(OUT)}`);
})().catch((e) => { console.error(e); process.exit(1); });
