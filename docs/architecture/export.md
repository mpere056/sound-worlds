# Export & Delivery

Turns a scene + performance into `final.mp4`: 1080×1920, 60 fps, H.264 + AAC,
audio = the Reaper master render, bit-for-bit repeatable.

## Render mode pipeline (in-browser)

```
for frame = 0 .. N-1:                       (N = ceil(durationSec * fps))
  t = frame / fps
  scene.renderFrame(t)
  videoFrame = new VideoFrame(canvas, { timestamp: frame * 1e6 / fps })
  encoder.encode(videoFrame, { keyFrame: frame % 120 === 0 })
  videoFrame.close()
  await backpressure()                       (encoder.encodeQueueSize < 4)
→ flush → mp4-muxer → out/<concept>.mp4 (video-only)
```

- **Encoder:** WebCodecs `VideoEncoder`, `avc1.640033` (H.264 High @ L5.1),
  `bitrate: 16_000_000`, `framerate: 60`, `latencyMode: 'quality'`. Hardware
  encode on Apple Silicon — typically **2–6× faster than realtime**, so a
  3-minute song exports in under 2 minutes.
- **Muxing (video container):** [`mp4-muxer`](https://github.com/Vanilagy/mp4-muxer)
  in-browser, writing through the File System Access API directly into
  `projects/<song>/out/` — no server, no memory blow-up (chunks stream to disk).
- **Progress UI** shows frame count, encode fps, ETA; the tab must stay
  focused (`requestAnimationFrame` throttling) — render mode uses a
  `setTimeout(0)` loop instead of rAF to be throttle-immune anyway.
- **Fallback path** (debugging / maximum quality): dump PNG frames to disk and
  assemble with ffmpeg (`-framerate 60 -i frame_%06d.png`). ~10× slower;
  exists because it's trivially inspectable frame-by-frame.

## Audio mux (ffmpeg, `scripts/mux.sh`)

Audio is **never** touched by the browser — the Reaper master WAV is the only
audio source, attached losslessly at the end:

```bash
ffmpeg -i out/metro.mp4 -i master.wav \
  -c:v copy -c:a aac -b:a 320k \
  -movflags +faststart -shortest final.mp4
```

- `-c:v copy` — video is not re-encoded; what WebCodecs made is what ships.
- Optional `--loudnorm` flag applies `loudnorm=I=-14:TP=-1` (streaming-platform
  loudness) to a *copy* — the untouched-master version is always kept.
- Sync sanity: video timestamps are exact rational frame times and the WAV
  starts at project time 0, so offset is structurally zero. The script still
  prints both stream durations and warns if they differ by > 1 frame.

## Platform delivery specs

| Target | Container | Video | Audio | Notes |
|---|---|---|---|---|
| TikTok | MP4 | 1080×1920@60, H.264 High, ~16 Mbps | AAC 320k | ≤ 60 s cuts uploaded best; keep key moments inside center-safe area |
| IG Reels | MP4 | same | same | Reels re-encodes aggressively — high source bitrate matters |
| YouTube Shorts | MP4 | same (or 4K variant) | same | Only target that meaningfully rewards a 2160×3840 master |
| Archive | MP4 | 2160×3840@60 re-render (`--scale 2`) | WAV (PCM) muxed | The forever-master; platform files derive from it |

`--scale 2` re-renders frames at 2160×3840 (resolution-independent scenes make
this free), not an upscale.

## Artifact stills (posters)

Concepts with an ending artifact (Painting, Metro Map, City skyline, Runner
route) also export a print still:

```bash
pnpm still --project mysong --concept painting --scale 4   # 4320×7680 PNG
```

Uses `scene.renderStill(tEnd, scale)` — same deterministic state at the final
timestamp, tiled rendering if the GPU can't allocate the full buffer in one
pass. Metro additionally exports true **SVG** (its layout is vector data in
`statics` — serialization, not rendering).

## Verification

- **Golden frames:** per concept, render frames at 5 fixed timestamps for a
  committed fixture project; compare perceptually (SSIM > 0.995). Catches
  visual regressions without watching videos.
- **Sync spot-check render:** `--overlay sync` burns the beat-flash overlay
  into a debug export — 30 seconds of watching confirms what the compiler
  tests already asserted numerically.
- **Determinism check:** `pnpm render … --hash` renders twice and compares
  frame-buffer hashes at 10 sampled frames.

## Known constraints

- WebCodecs H.264 availability differs by browser/OS — Chrome on macOS is the
  supported render environment (dev preview works anywhere).
- Canvas is sRGB 8-bit; heavy glow gradients can band. Mitigation: film-grain
  pass (already in the post chain) dithers banding away — keep it ≥ 0.02 in
  dark scenes (Descent, Corridor).
- A crashed render must be re-run from frame 0 (encoder state isn't
  checkpointable). At 2–6× realtime this costs minutes, so per-chunk recovery
  isn't worth its complexity.
