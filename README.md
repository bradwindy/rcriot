# RC Riot

Low-poly RC car racing in the browser, drawn like a PlayStation 1 game. The influences are Mario Kart, RC Revenge and Re-Volt.

Make a party, send the link to your friends and race each other and bots, up to 12 cars, on a keyboard or a phone, on nine movie-set tracks with the pick-ups from RC Revenge. Practice races you alone against 7 bots over 3 laps.

The game opens on an arcade title screen, with bots racing round the track behind the logo. Press any key or tap for the menu: CREATE PARTY, JOIN PARTY (type the 5-letter code), PRACTICE and EFFECTS. Practice goes from the car select to the level select. After every race a results board shows places and times, then awards and everyone's stats, a page at a time.

## Racing online

Pick Create party and send the link (COPY LINK in the party panel shares it on a phone). Everyone who opens it joins the lobby, picks a car and can change their name. Two people may drive the same car. The party host sets:

- **Track**: any of the nine, from the TRACK row or with T. Everyone in the lobby sees the pick.
- **Laps**: 1 to 9, 3 to start with.
- **Bots**: how many bots join the grid after the people, up to 12 cars in all.
- **Bot skill**: Easy, Normal or Hard. Easy bots drive slower and wider, Hard bots take corners faster and always get a rocket start.
- **Items**: pick-ups on or off.

The host presses START RACE. The grid is shuffled every race. Once the first person crosses the finish line, everyone else has 30 seconds, and anyone still racing then is placed by how far they got. The race also ends as soon as every person has finished. The results board shows places, times and best laps, then awards and everyone's stats. The host's NEXT RACE takes everyone back to the lobby.

People who open the link during a race watch it, following the leader, and race next time. If your connection drops mid-race, a bot drives your car until you're back, and reloading the page takes it back. In an online race Esc or MENU opens the party panel over the race, where LEAVE quits. People watching see the panel from the start.

The party host's browser runs the race, so the host keeps that tab open until it ends. A laptop or desktop makes the best host. If the host leaves or drops for 5 seconds, the race ends and everyone goes back to the lobby with a new host. The lobby shows everyone's ping to the host.

## The tracks

The tracks are movie sets in a theme park, grouped into worlds like RC Revenge's. The level select picks a world, then a track. The highlighted track flies past behind the menu, with its length, map and your best lap on it, which the browser keeps.

| World | Track | Length | The set |
|---|---|---|---|
| Pirate | Pirate Cove | 922 m | A beach: a pier over the lagoon, a wrecked galleon, a stunt ramp and a torch-lit smugglers' cave. |
| Jungle | Inca Temple | 1,552 m | A jungle village, a gorge with a waterfall, a climb over a stepped pyramid, a torch-lit temple hall with a golden idol and a cave of glowing toadstools. |
| Jungle | Lava Dig | LAVA_LEN | LAVA_SET |
| Horror | Graveyard | 1,528 m | A moonlit cemetery with a crypt and a vampire's lair. |
| Horror | Mad Lab | MAD_LEN | MAD_SET |
| Planet | Moon Base | 1,595 m | Dusty craters in low gravity, a lander, a crevasse and a ring of habitat domes with airlocks. |
| Planet | Reactor | 1,580 m | A space-station reactor at night: a glowing core, a coolant hall and a neon plasma coil that climbs round a spire. |
| Monster | Monster Docks | 1,558 m | A harbour where a sea monster has wrecked an ocean liner. |
| AKLM | Cartoon Farm | 1,529 m | A cartoon farm with barns, a pond and giant animals. |

Every track but Pirate Cove has one fork: a risky shortcut, narrower and often over a pit, against a safer way round. Pits of lava, goo or the void swallow a car that drops in and put it back on the road past the pit after a short wait. Each of those tracks also has one or two timed hazards, such as a swinging noose, a rolling stone ball, a monster's bite or a plasma vent. They run off the race clock, so everyone online sees them in the same place. A hazard spins or launches the car it hits, unless the car is shielded or flying over it. Headlights come on in tunnels, buildings and on night tracks.

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
- M mutes, Esc goes back from a practice race to the car select screen and from there to the title, P opens the effects panel.

### Phone

Hold the phone sideways. Put your left thumb anywhere on the left half to steer. GAS, BRAKE, DRIFT, FIRE and BACK sit on the right, and RESET, CAM and MENU along the top. The effects panel opens from the title screen. BACK on the car select screen goes to the title.

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

The game is one Cloudflare Worker and the players' browsers. The party host's browser runs each race, and everyone else plays over a direct WebRTC link to it, so gameplay never goes through Cloudflare unless a network needs a relay. The lobby, signalling and links follow Puckagon's.

- `src/shared` holds the code more than one side runs: the track spline and its queries, the car physics with drifts and boosts, the car roster and stats, the pick-ups (`items.ts`), the bots with their skill levels, the race with its countdown, laps, finish and stats (`race.ts`), the snapshot format (`snapshot.ts`), the lobby settings and grid (`lobby.ts`) and the message protocol. The sim runs on a fixed 1/60 s tick.
- `src/host` is the race on the host's page. It runs in a Web Worker at 60 Hz, whose timers keep time when the tab is in the background.
- `src/worker` holds the Worker and one Durable Object class, `Party`. Each party code maps to its own Durable Object. It keeps the lobby (players, names, cars, settings and who is host), builds each race's grid, relays WebRTC signalling and keeps the last race's results. It runs no physics.
- `src/client` is the browser game. It uses Three.js with custom shaders. `render/ps1.ts` holds the PS1 material and `render/post.ts` holds the low-res buffer, bloom and the CRT pass. Each track's layout (its spline, fork, hazards and pick-up rows) is a `TrackDef` in `src/shared/tracks/`, and `src/shared/course.ts` builds it, fork included, into the `Track` the sim and the page share. Each track's scenery is built in code from `src/client/tracks/<id>/`, on the kit in `render/road.ts` (the road, swept along the spline) and `render/terrain.ts` (the ground), and swapped when another track loads. `levels.ts` is the level select. `render/cars.ts` builds the ten car bodies. `audio.ts` synthesises the sound, `touch.ts` draws the phone controls, `select.ts` is the car select screen and `lobby.ts` the party panel.

Every page keeps a WebSocket to its party. Each guest also opens a game link to the host: an `RTCPeerConnection` with a reliable `control` channel for pick-up events and the result, and an unreliable `state` channel, like UDP, for snapshots, inputs and pings. Snapshots go every tick as a flat block of 32-bit floats, about 3 kB for a full grid.

Each player's page samples the controls once per tick and sends each sample as it is taken, repeating the ones the host hasn't applied yet, so a lost message costs nothing. The host applies one sample per tick, and each snapshot says which of your samples it has applied. Your page draws the race in your own time (`src/client/predict.ts`): each tick it loads the newest snapshot and drives every car on from there, yours with the samples the host has still to apply and the others as they were last driven, so your car answers at once whatever the ping. When a new snapshot moves a car from where the guess had it, the jump fades out over about 80 ms. Pick-ups land when the host says so, a round trip after you press the button.

Add `?lag=150&jitter=20` to the page URL to feel a slow connection, and `?relay=1` to send game links only through a TURN relay.

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

`npm run dev` serves the game at http://localhost:5173 with the Worker and Durable Object running locally in `workerd`. Open it in two browser tabs to try a host and a guest on one machine. `npm run check` runs the type check, lint and tests. The tests run inside the Workers runtime. They check every track with a 12-bot race (length, the fork used both ways, jumps, a dark stretch), forks, pits and hazards, the drift boost, the rocket start and wheelspin, that every car laps inside the barriers, the pick-up odds by position, the Shield, Blue Lightning, the Ultimate Weapon, a homing rocket, the finish rules, that a snapshot predicts the cars as the host moves them, and a whole lobby, race and result over real sockets.

After changing `wrangler.jsonc`, regenerate the binding types with `npm run types`.

## Deploying

Pushes to `main` deploy to https://rcriot.bradwindy.workers.dev through Workers Builds, Cloudflare's Git integration. Pushes to any other branch upload a preview version with its own Durable Objects, without touching the live site. To deploy by hand from a machine signed in with `npx wrangler login`:

```bash
npm run deploy
```

Every deploy restarts the Durable Objects, so every party socket drops and reconnects. Races run in the host's browser and the game links don't go through the Durable Object, so a race in play carries on if the host's page is back within 5 seconds. A deploy that bumps `PROTOCOL_VERSION` tells every page to reload, which ends the races in play.

The repo has no secrets. The TURN key lives only in Cloudflare as two Worker secrets. Create a TURN key in the Cloudflare dashboard under Realtime, then set its ID and API token on the Worker:

```bash
npx wrangler secret put TURN_KEY_ID
```

```bash
npx wrangler secret put TURN_KEY_API_TOKEN
```

Deploys keep secrets. Branch previews have their own secret settings, so without them a preview hands out STUN only. Locally, the dev server runs without a TURN key.

## Licence

MIT
