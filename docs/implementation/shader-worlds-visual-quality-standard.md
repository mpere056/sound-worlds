# Shader worlds visual-quality standard

This standard separates physics proof from final presentation. A rough first
draft is expected and desirable while timing, inverse physics, occupancy, and
seeking are unsettled. A concept may not be called visually complete merely
because its shader is colorful, bright, or technically complex.

Use this standard together with the
[Sound Worlds engineering and design learnings](sound-worlds-engineering-learnings.md),
which explains when a shader should be the foundation, when ordinary geometry
is more appropriate, and which visual failure patterns have already been
rejected in implemented worlds.

## Promotion stages

### Q0 - Physics graybox

- Flat materials, simple targets, one readable trail, and a neutral background.
- Show contact normals, field axes, curvature, deadlines, and rejected geometry
  in optional diagnostics outside the exported frame.
- Judge exact timing, continuity, collision, camera containment, and seeking.
- No visual-quality judgment beyond legibility and absence of rendering defects.

### Q1 - Art-direction lock

- Approve one concise visual thesis, a restrained palette script, material
  families, scale references, and three representative target frames.
- Define what remains dark, what earns the brightest value, and how pitch and
  velocity vary appearance without turning the scene into an unrestricted hue
  wheel.
- Identify explicit anti-goals such as generic neon, uniform bloom, visual noise,
  stock sci-fi panels, weightless camera motion, or every object pulsing equally.

### Q2 - Composition and camera

- Maintain a clear hierarchy: hero object, next interaction, recent trajectory,
  environment, then secondary effects.
- Use compiled position, velocity, curvature, and look-ahead to produce a stable
  camera with bounded angular velocity, acceleration, zoom, and roll.
- Preserve depth cues through overlap, parallax, atmospheric perspective,
  shadows, trail taper, and scale, not blur alone.
- Validate 9:16 first, then desktop. The hero and upcoming interaction must
  remain readable without pinning the hero mechanically to screen center.

### Q3 - Materials, lighting, and shader craft

- Use linear-light calculations, explicit color-space conversions, controlled
  exposure, filmic tone mapping, and bloom thresholds that preserve form.
- Integrate raymarched and rasterized depth correctly. Eliminate halos at
  intersections, temporal swimming, banding, NaNs, unstable normals, and visible
  resolution seams.
- Give objects coherent material responses: roughness, transmission, absorption,
  emission, and shadow behavior must support the world's visual thesis.
- Adaptive quality may change samples, resolution, and secondary detail only;
  it may not change silhouettes, timing, physics, or camera composition.

### Q4 - Motion and musical effects

- Derive effect origin, direction, and propagation from compiled physical state.
- Give every effect an authored attack, propagation, decay, and brightness cap.
- Reserve large spectacle for musically important moments. Ordinary notes need
  precise, elegant responses rather than maximum visual intensity.
- Trails communicate direction and depth without becoming opaque ribbons that
  hide the world. Camera shake is exceptional, short, and amplitude-bounded.

### Q5 - Final acceptance

- Run a full audio watch-through plus exact-note scrubs, silent playback, random
  seeks, loop boundaries, and final-frame inspection.
- Capture approved frames at opening, sparse, dense, section-change, climax, and
  ending moments. Review silhouette, value grouping, depth, color, material,
  motion, and visual ownership at each frame.
- Require stable 60 FPS at the reference resolution and document the quality
  tier used for acceptance.
- Remove diagnostic labels, placeholder geometry, debug palettes, accidental UI,
  and effects whose only justification is that the shader can produce them.

## Shared professional-quality rules

1. One visual idea dominates each world; secondary techniques support it.
2. Pitch selects within an authored palette and material family, never raw hue.
3. Velocity controls bounded energy, scale, or contrast, not unlimited exposure.
4. Darkness and negative space are compositional tools, not empty failure states.
5. The next musical target is visually discoverable before contact.
6. Dense passages simplify secondary detail to protect timing readability.
7. The final note receives a prepared visual resolution, not a generic flash.
8. Shader complexity must survive still-frame inspection; motion cannot conceal
   poor geometry, clipping, noisy normals, or incoherent materials.

## Required artifacts

Every concept promoted beyond graybox must add:

- a one-page art-direction brief;
- a palette and exposure script across song sections;
- camera and effect-envelope diagnostics;
- six approved reference frames;
- a full-song frame-time trace;
- a list of known visual compromises at each adaptive quality tier.
