# Song Authoring Guide — preparing a Reaper project so the visualizers look good

The single highest-leverage improvement available right now requires **no
code**: give the pipeline a project that actually contains the musical
information the visualizers are built to express. The current test project
(11 s, four identical piano tracks, no drums/bass/regions) starves every
beauty mechanism — see [Quality Gap Analysis](quality-gap-analysis.md) §2.

This guide is the authoring contract. Everything here maps 1:1 to a consumer
in the compilers.

## 1. The golden rules

1. **Name tracks so roles resolve.** Role assignment is name-driven. Use plain
   names: `Kick`, `Snare`, `Hats`, `Bass`, `Lead`, `Keys`, `Pads`, `Vox`,
   `FX Riser`. Check the analyzer's role report after export — any track that
   lands in `other` is invisible to most mechanics.
2. **MIDI wherever possible.** MIDI notes are perfect data (exact pitch,
   velocity, timing). Audio-only melodic stems degrade to pitch-tracking or
   activity fallbacks. Keep at least Bass and Lead as MIDI items.
3. **Label your sections as regions.** `Intro`, `Verse 1`, `Chorus`,
   `Verse 2`, `Chorus 2`, `Bridge`, `Chorus 3`, `Outro`. Regions are free in
   Reaper and drive: Runner gates/palettes/biomes, Metro rings (chorus
   repetition!), camera arcs. **Repeated section names must match exactly** —
   `Chorus` twice = a repeat group; `Chorus`/`Hook` = two unrelated sections.
4. **Real song length.** 2–4 minutes. Under ~60 s there is no structure to
   visualize; TikTok cuts come later from the full render.
5. **One role, one intent.** Don't bus five layered synths all named
   `Lead` — pick the *hero* melody track and name only that one `Lead`; name
   doubles `Keys`/`Pads` (or leave them unnamed to stay out of the way).

## 2. What each mechanic consumes

| You provide | Runner uses it for | Metro uses it for |
|---|---|---|
| `Bass` (MIDI ideal) | **Terrain** — pitch = elevation; runs become staircases, held notes become mesas | A line + transfers where it meets other parts |
| `Snare` (or `Clap`) | **Jump landings** — every snare is a frame-perfect touchdown | Beacon blinks at interchanges |
| `Kick` | Ground pulses, footfall lock, camera zoom-kicks | Signal-tie pulses at the frontier |
| `Hats` | Double-jump mid-impulses, sparkle ticks | — |
| `Lead` (MIDI strongly preferred) | **Glyph melody** — collectibles at pitch height, collection beams | The hero line — melodic motion becomes staircase geometry |
| `Keys`/`Pads` (MIDI chords) | Palette/atmosphere | Chord-cluster interchange bars; a calmer parallel line |
| `Vox` | Halo brightness | A line (if MIDI) or skip |
| `FX Riser`/`Downlifter` automation or stem | World tilt, float/slow-mo segments | — |
| Regions | Gates, palette shifts, biome arcs | **Chorus rings + train laps (M4)** — impossible without them |
| Tempo map | Gravity scaling (`g = 8A/T_beat²`), all quantization | Row grid, train scheduling |

Minimum viable set for both games to look intentional:
**Kick + Snare + Bass(MIDI) + Lead(MIDI) + one Keys/Pads + regions, ≥ 2 min.**

## 3. Reference test song spec

Author one throwaway track to this spec and keep it forever as the pipeline's
benchmark project (goldens, tuning sessions, demos):

| Property | Spec | Why |
|---|---|---|
| Length / tempo | ~2:30 at 96–120 BPM, 4/4, fixed tempo | Comfortable jump arcs, easy eyeballing |
| Structure (regions) | Intro 8 bars · Verse 16 · Chorus 16 · Verse 16 · Chorus 16 · Bridge 8 · Chorus 16 · Outro 8 | Exercises repeat groups (3× Chorus → Metro ring + 3 laps; Runner déjà-vu ghost) |
| Kick | 4-on-floor verses; busier chorus pattern | Steady pulse vs. section contrast |
| Snare | Backbeats 2/4; **one fill** before each chorus | Regular landings + double-jump moments |
| Hats | 8ths verses, 16ths choruses | Density contrast; mid-impulse candidates |
| Bass (MIDI) | Verse: held roots (mesas). Chorus: walking/octave run (staircases). Bridge: slow climb | Makes terrain narrative *visible* — this track literally draws the level |
| Lead (MIDI) | Verse: sparse motif. Chorus: the hook, wide range (≥ 1.5 octaves). One fast run somewhere | Glyph constellations + one "melody drawn in the world" moment; Metro staircase geometry |
| Keys (MIDI) | 4-chord loop, different voicing per section | Chord clusters, palette movement |
| FX | One riser into each chorus, one downlifter into the bridge | Tilt/float/alarm mechanics |
| Mix | Nothing fancy; clear per-track separation | Onset detection quality |

Two hours of work; it converts every future "does it look right?" question
into a controlled experiment.

## 4. Export & verify checklist

- [ ] Every intended track has a resolving role (check the analyzer role log —
      nothing important in `other`)
- [ ] Bass and Lead are MIDI items (not just audio)
- [ ] Regions present, repeated sections named identically
- [ ] Project ≥ 2 min, tempo map correct
- [ ] Run the full-package export action; confirm `export-report.json` lists a
      stem per track + master
- [ ] Run the analyzer; skim `song.json`: `sections[]` populated with correct
      `repeatGroup`s, per-track `events` non-empty for MIDI tracks, drum
      `events` (onsets) present for Kick/Snare/Hats
- [ ] Only then judge visuals — any look-assessment made on a project that
      fails this checklist is measuring the fallbacks, not the design

## 5. What fallbacks look like (so you can recognize them)

| Symptom on screen | Missing input |
|---|---|
| Runner jumps land metronomically on every bar | No snare/clap/percussion role |
| Terrain is a low-contrast wobble, no plateaus/staircases | No bass (envelope fallback) |
| Glyphs pulse on the beat instead of tracing a melody (`AUDIO-ACTIVITY` in the status readout) | No usable lead MIDI |
| No palette/scene changes across the whole song; Metro never forms a ring | No regions |
| Metro lines overlap into one thick braid with transfers everywhere | All tracks same instrument/role |

If you see these, fix the project, not the code.
