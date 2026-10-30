# RC Riot

Low-poly RC car racing in the browser, drawn like a PlayStation 1 game. The influences are Mario Kart, RC Revenge and Re-Volt.

This is round 3 of 4: the power-ups. You pick one of 10 RC cars and race 7 bots round one track, on a keyboard or a phone, with the pick-ups from RC Revenge. Online multiplayer comes in the last round.

## The track

Pirate Cove is a movie set on a beach. The lap starts on the sand under the start arch, with the film crew's lights and camera crane beside it. It runs along a pier over the lagoon, through a wrecked galleon, over a stunt ramp, through a torch-lit smugglers' cave and back down to the beach.

## Driving

The cars are light RC cars. They slide a little, bounce off walls and each other (heavier cars push lighter ones), hop over bumps, bounce on hard landings and can steer a little in the air. They always land on their wheels.

- **Drift.** Hold Drift while steering at speed. The car hops and slides into the corner. Steering into the drift tightens it and steering out widens it. Hold it and sparks under the rear wheels turn blue, then orange. Let go for a short boost on blue or a longer one on orange. Slowing right down or hitting a wall hard ends the drift with no boost.
- **Rocket start.** Press the gas just before GO for a boost off the line. Press it too early and the wheels spin for a moment instead.

## Pick-ups

Drive through the spinning blue boxes to collect a pick-up. The slot at the top of the screen spins through the items for a moment before it lands on yours. You carry one at a time and must use it before you can collect another. E (or FIRE on a phone) uses it forward, and Q (or BACK) uses it backward. The list comes from the RC Revenge Pro manual. The effects are this game's own take.

| Pick-up | What it does |
|---|---|
| Battery | A big speed boost for about 2 seconds. |
| Rocket (1 or 3) | Hold the car ahead in your sights until LOCK flashes, then fire and it homes in. Unlocked rockets fly down the track. Fire behind to hit the car on your tail. |
| Heat Ray | 5 seconds of flame out of your nose. Cars in it lose power and smoke. |
| Blue Lightning | 10 seconds of charge on your aerial. Anyone who comes close is zapped and loses power. Two charged cars cancel each other out. |
| Oil Spill | A splat on the track behind you. Cars that drive through it lose their grip for 2.5 seconds and slide out. |
| Bouncing Mines (1 or 3) | Spiked balls launched behind you. They bounce, hop about on their own, rebound off barriers and walls, and can bounce clean over a barrier out of play. |
| Shield | 10 seconds of immunity in a green bubble, and you barge other cars aside. |
| Water Bombs (1 or 3) | Lobbed at the car ahead, or behind you. A car it hits floats high in a bubble for 2 seconds, out of everyone's way. Mash an item button to pop out sooner. |
| Shockwave | A ring of fire bursts out round you and flings nearby cars away. |
| Fake | Drops a box behind you that looks like a pick-up but explodes. It flashes as it falls and only arms after about a second, so it can't catch the car right behind you. |
| Ultimate Weapon | Rare, and only for cars near the back. A thunderbolt shorts out every other car. |

Rockets, Bombs and Mines come in packs of three more often the further back you are. Leaders mostly get Batteries, Shields, Oil, Mines and Fakes, and the back of the pack gets the strong ones. Bots collect and use pick-ups too. A car caught by a rocket, mine, fake or shockwave is flung up spinning flat and lands slowed right down. The Items row in the effects panel turns pick-ups off.

### Keyboard

- Arrow keys or WASD to drive. Space or Shift to drift. E fires your pick-up ahead and Q fires it behind. Mines, Oil and Fakes always go behind.
- B looks back, C changes the camera (chase, far chase, bumper), R puts your car back on the track.
- M mutes, Esc goes back to the car select screen, P opens the effects panel.

### Phone

Hold the phone sideways. Put your left thumb anywhere on the left half to steer. GAS, BRAKE, DRIFT, FIRE and BACK sit on the right, and RESET, CAM and MENU along the top. The effects panel opens from the car select screen.

## The cars

Every car has five stats from 1 to 5, and every car's stats add up to 15, so none is better overall. In a bots-only test every car laps within 10% of the others.

| Car | Theme | Speed | Accel | Handling | Grip | Weight |
|---|---|---|---|---|---|---|
| Sand Flea | Pirate beach buggy with a cannon exhaust | 3 | 3 | 3 | 3 | 3 |
| Chomper | Shark on monster-truck wheels | 2 | 3 | 2 | 4 | 4 |
| Comet | Silver rocket with flames | 5 | 2 | 3 | 3 | 2 |
| Saucer | Flying saucer with a pilot in the dome | 4 | 4 | 4 | 2 | 1 |
| Last Ride | Hearse with a coffin on the roof | 2 | 2 | 3 | 3 | 5 |
| Safari | Zebra-striped jungle jeep | 3 | 4 | 4 | 2 | 2 |
| Raptor | Dinosaur with a tail spoiler | 5 | 3 | 2 | 2 | 3 |
| Galleon | Pirate ship on wheels | 3 | 3 | 1 | 4 | 4 |
| Quackers | Rubber duck | 1 | 5 | 5 | 3 | 1 |
| Boneshaker | Skeleton dune buggy | 4 | 3 | 3 | 4 | 1 |

Each car is themed on one of RC Revenge's movie worlds: pirates, monsters, sci-fi, horror, jungle and cartoons.

## Sound

Everything you hear is synthesised in code. Each motor is a muffled two-stroke hum that sits in the background: a steady train of soft cracks through two lowpass filters. Each car has its own rev range and amount of rasp, from the Galleon's low putter to Quackers' quicker buzz. The Engine row in the effects panel sets motor volume to Quiet (the default), Normal or Off without touching the other sounds. The two nearest bots' motors play quieter, panned to where they are. The rest, kept well under the motors and softened on top: tyre skids, drift sparks, boosts, bumps, landings and the countdown. M or the Sound row in the effects panel turns it off.

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

- `src/shared` holds the parts a server will also run later: the track spline and its queries, the car physics with drifts and boosts, the car roster and stats, the pick-ups (`items.ts`: boxes, odds, effects and everything they leave on the track), the bots, and the race with its countdown. The sim runs on a fixed 1/60 s tick.
- `src/client` is the browser game. It uses Three.js with custom shaders. `render/ps1.ts` holds the PS1 material and `render/post.ts` holds the low-res buffer and the dither pass. The world is built in code when the page loads: `terrain.ts` for the island, `road.ts` for the road, pier, cave and wreck (swept along the track spline), and `props.ts` for the palms, rocks and film crew. Static geometry is merged into one mesh per material. `render/cars.ts` builds the ten car bodies. `audio.ts` synthesises the sound, `touch.ts` draws the phone controls and `select.ts` is the car select screen.

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

`npm run dev` serves the game at http://localhost:5173. `npm run check` runs the type check, lint and tests. The tests check the drift boost, the rocket start and wheelspin, that every car laps inside the barriers, the pick-up odds by position, the Shield, Blue Lightning, the Ultimate Weapon and a homing rocket.

## Licence

MIT
