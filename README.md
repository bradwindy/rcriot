# RC Riot

Low-poly RC car racing in the browser, drawn like a PlayStation 1 game. The influences are Mario Kart, RC Revenge and Re-Volt.

This is round 1 of 4: the graphics. You drive one car round one track against 7 bots. Controls, power-ups and online multiplayer come in later rounds.

## The track

Pirate Cove is a movie set on a beach. The lap starts on the sand under the start arch, with the film crew's lights and camera crane beside it. It runs along a pier over the lagoon, through a wrecked galleon, over a stunt ramp, through a torch-lit smugglers' cave and back down to the beach.

## Controls

- Arrow keys or WASD to drive.
- C changes the camera: chase, far chase, bumper.
- R puts your car back on the track.
- P (or the EFFECTS button) opens the effects panel.

## The PS1 look

Every effect can be switched off or changed live in the effects panel. Your choices are saved in the browser.

- **Low resolution.** The scene is drawn into a buffer 240 pixels tall, then scaled up with hard pixel edges.
- **Vertex wobble.** Vertex positions snap to the low-res pixel grid, so edges jitter as things move. This is how the PS1 worked, because it had no sub-pixel precision.
- **Texture warp.** Textures skip perspective correction, so they bend across big polygons.
- **15-bit colour with dithering.** Colour is cut to 5 bits per channel through the PS1's own 4x4 dither pattern.
- **Per-vertex lighting and fog.** Sun, sky and torch light are worked out at each vertex and blended across faces. Fog works the same way.
- **Small textures.** All textures are 16 to 128 pixels and drawn from code. There are no image files. Up close they stay pixel-sharp. Far away they are mipmapped, so the distant ground stops shimmering. Set Far textures to Raw for the console's unfiltered look. Leaves, flags, flames and clouds have their own Far cut-outs switch. Their mipmaps are built by hand to keep the same share of solid texels at every size, so palm fronds keep their shape far away instead of thinning out and flickering.
- **Thin parts.** Ropes, rails, posts and antennas are far thinner than a 240p pixel, so on their own they break up and pop as you move. Each one also gets a 1-pixel line down its middle, which always lights at least one pixel and hides inside the real part up close. PS1 games drew wires the same way.
- **CRT.** A composite-TV pass over the top: each line smears sideways and melts the dither, red and blue drift apart, bright areas glow, every row becomes a scanline, with grain and darker edges. Soft by default, Strong adds a shadow mask and a rolling band. No barrel curvature.

## How it works

- `src/shared` holds the parts a server will also run later: the track spline and its queries, the car physics, the bots and the race. The sim runs on a fixed 1/60 s tick.
- `src/client` is the browser game. It uses Three.js with custom shaders. `render/ps1.ts` holds the PS1 material and `render/post.ts` holds the low-res buffer and the dither pass. The world is built in code when the page loads: `terrain.ts` for the island, `road.ts` for the road, pier, cave and wreck (swept along the track spline), and `props.ts` for the palms, rocks and film crew. Static geometry is merged into one mesh per material.

## Development

Needs Node 22.13 or newer, 24, or 26 and up.

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run check
```

`npm run dev` serves the game at http://localhost:5173. `npm run check` runs the type check, lint and tests.

## Licence

MIT
