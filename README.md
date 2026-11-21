[![NEON HARBOR](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=referral&utm_campaign=bounty)
[![Rank](https://make.fun/badge/gta6-01/hudobeld/neon-harbor/rank.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=referral&utm_campaign=bounty)
[![Reward](https://make.fun/badge/gta6-01/hudobeld/neon-harbor/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=referral&utm_campaign=bounty)

# NEON HARBOR — an open-world crime game in Aurora Bay

A 2D top-down open-world crime game, built for make.fun's **Make GTA 6** bounty.
Everything is original: the city of Aurora Bay, the characters, the story, the
art and the sounds. No real city, person, brand or game appears in it.

You are Jax, a driver-for-hire. Walk the streets, steal cars, dodge the
Aurora Bay police, and work through six story missions — a timed harbor run,
package pickups, a three-star heat wave, a wrecking crew, taxi fares, and one
last big score.

## How to play

Serve `game/` with any static server and open `index.html` in a desktop browser:

```sh
node serve.ts
# then open http://localhost:8080
```

| Key | Action |
| --- | --- |
| WASD / Arrows | Move on foot, drive |
| Shift | Run |
| Space | Handbrake |
| E | Enter / steal a car, start a mission, respray |
| F | Punch |
| Mouse click | Shoot |
| P / Esc | Pause |
| M | Mute |

## What is in the game

- **A city to explore**: grid streets, varied buildings, parks, a south
  waterfront and a river crossed by two bridges — about 2400×1800, with a
  camera that follows Jax.
- **Cars and traffic**: traffic driving the road graph, parked cars to steal,
  car damage and smoke, collisions, handbrake turns.
- **Pedestrians** who wander the sidewalks and flee from gunfire and speeding cars.
- **A wanted system**: 1–5 stars from stealing cars, hitting pedestrians,
  shooting and fighting the police. Foot cops and police cars chase Jax; the
  heat fades when he stays out of sight, and a respray garage clears it for cash.
- **Six missions** with timers, markers and cash rewards, plus a story that
  unlocks one mission at a time.
- **An economy**: mission pay, respray and bail costs, health and ammo pickups.
- **A HUD** with health, money, wanted stars, a live minimap, speed, a clock
  and the current objective — plus a title screen, pause, caught and down
  screens, and saving to localStorage.
- **Synthesized sound**: engine hum, two-tone siren, gunshots, crashes and
  pickup blips — WebAudio only, no audio files.

## Files

- `game/index.html` — the page, a 1280×800 canvas.
- `game/src/config.js` — constants and palette.
- `game/src/random.js` — seeded random helpers.
- `game/src/world.js` — the seeded city, road graph and collisions.
- `game/src/input.js` — keyboard and mouse.
- `game/src/audio.js` — synthesized WebAudio sounds.
- `game/src/missions.js` — the six-mission state machine.
- `game/src/render.js` — world, entities, HUD, minimap and screens.
- `game/src/shots.js` — staged scenes for the screenshots.
- `game/src/main.js` — game state, loop, physics, AI, wanted system, economy.
- `main.ts` — the entry program: copies `game/` and `screenshots/` to
  `/output` and writes `dossier.json`.
- `screenshots/` — four real renders of the game.

## License

MIT — see `LICENSE`.
