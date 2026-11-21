// NEON HARBOR — game state, loop, physics, AI, wanted system, economy, save/load.
// Jax, driver-for-hire in Aurora Bay. All original: city, characters, story.

import { WORLD_W, WORLD_H, VIEW_W, VIEW_H, PLAYER_R, PLAYER_WALK_SPEED, PLAYER_RUN_SPEED, START_MONEY, RESPRAY_COST, BAIL_COST, AMMO_PICKUP, HEALTH_PICKUP, SAVE_KEY } from './config.js';
import { buildWorld, isOnRoad, isWater, hitBuilding, resolveBuildingCollision, nearestNode } from './world.js';
import { makeRng, clamp, dist, angleTo, angleDiff } from './random.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { draw } from './render.js';
import { applyShot } from './shots.js';
import { MISSION_DEFS, startMission, updateMission, missionStartPoint } from './missions.js';

const SEED = 20261121;
const PED_COLORS = ['#e07a5f', '#81b29a', '#f2cc8f', '#90a8c8', '#c98ad0', '#7fb069'];

export function createState(seed) {
  const world = buildWorld(seed);
  const rng = makeRng(seed + 7);
  const state = {
    seed, world, rng,
    mode: 'title',
    time: 0,
    money: START_MONEY,
    ammo: 24,
    heat: 0,
    lastCrimeAt: -100,
    lastShotAt: -100,
    lastShotX: 0, lastShotY: 0,
    wantedStars: 0,
    player: { x: 1250, y: 1300, angle: -Math.PI / 2, hp: 100, car: null },
    cars: [],
    peds: [],
    cops: [],
    particles: [],
    mission: { index: 0, phase: 'idle', timer: 0, progress: 0, targets: [], stopIndex: 0, fare: null, message: '' },
    camera: { x: 610, y: 900 },
    banner: null,
    prompt: '',
    bailCost: BAIL_COST,
    hasSave: false,
    audio: new AudioSys(),
    punchCd: 0,
    copPunchCd: 0,
    pickupTimer: 0,
    saveTimer: 0,
    shot: null,
  };

  // Traffic cars, driving the road graph.
  for (let i = 0; i < 10; i++) {
    const node = rng.int(0, world.nodes.length - 1);
    state.cars.push(makeTrafficCar(state, node));
  }
  // Pedestrians on the sidewalks.
  for (let i = 0; i < 24; i++) {
    state.peds.push(makePed(state));
  }
  return state;
}

function makeTrafficCar(state, nodeIdx) {
  const n = state.world.nodes[nodeIdx];
  const next = state.world.neighbours[nodeIdx][0];
  return {
    kind: 'traffic', x: n.x, y: n.y,
    angle: angleTo(n.x, n.y, state.world.nodes[next].x, state.world.nodes[next].y),
    speed: 0, cruise: state.rng.range(60, 110),
    node: nodeIdx, next, from: nodeIdx,
    color: state.rng.pick(['#c23b2e', '#2e6fc2', '#e0a52e', '#3fae6a', '#8a4dc2', '#d8d8d8', '#2a2a2a']),
    hp: 60, ramCd: 0,
  };
}

function makePed(state) {
  const n = state.world.nodes[state.rng.int(0, state.world.nodes.length - 1)];
  return {
    x: n.x + state.rng.range(-70, 70), y: n.y + state.rng.range(-70, 70),
    tx: n.x, ty: n.y, speed: state.rng.range(35, 60),
    color: state.rng.pick(PED_COLORS), hp: 30,
    fleeing: false, fleeUntil: 0, stay: false, fare: false,
  };
}

// The player's own car, created on demand.
function playerCar(state) {
  if (state.playerCarObj) return state.playerCarObj;
  const car = {
    kind: 'player', x: state.player.x, y: state.player.y, angle: state.player.angle,
    speed: 0, cruise: 0, color: '#f2c14e', hp: 100, ramCd: 0,
  };
  state.cars.push(car);
  state.playerCarObj = car;
  return car;
}

function spawnPoliceCar(state, x, y) {
  const car = {
    kind: 'police', x, y, angle: 0, speed: 0, cruise: 150,
    color: '#1c4fd6', hp: 80, ramCd: 0,
    node: nearestNode(state.world, x, y), next: nearestNode(state.world, x, y), from: 0,
  };
  car.next = state.world.neighbours[car.node][0];
  state.cars.push(car);
  return car;
}

function spawnCop(state, x, y) {
  state.cops.push({ x, y, hp: 60, punchCd: 0 });
}

function spawnTargetCar(state) {
  const n = state.world.nodes[state.rng.int(0, state.world.nodes.length - 1)];
  const car = {
    kind: 'target', x: n.x, y: n.y, angle: 0, speed: 0, cruise: 70,
    color: '#ff3b30', hp: 60, ramCd: 0, target: true,
    node: nearestNode(state.world, n.x, n.y), next: 0, from: 0,
  };
  car.next = state.world.neighbours[car.node][0];
  state.cars.push(car);
  return car;
}

// A crime adds heat; the wanted stars follow from it.
function crime(state, amount) {
  state.heat = Math.min(100, state.heat + amount);
  state.lastCrimeAt = state.time;
}

function addParticles(state, x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const a = state.rng.range(0, Math.PI * 2);
    const s = state.rng.range(40, 180);
    state.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.6, maxLife: 0.6, color,
    });
  }
}

// ---- per-frame update ----

function update(state, dt, input) {
  state.time += dt;
  state.wantedStars = state.heat <= 0 ? 0 : Math.min(5, Math.ceil(state.heat / 20));

  // Wanted decays only while no police can see the player.
  const policeNear = state.cops.some((c) => dist(c.x, c.y, state.player.x, state.player.y) < 500)
    || state.cars.some((c) => c.kind === 'police' && dist(c.x, c.y, state.player.x, state.player.y) < 500);
  if (state.heat > 0 && !policeNear && state.time - state.lastCrimeAt > 4) {
    state.heat = Math.max(0, state.heat - 2.5 * dt);
  }
  if (state.heat <= 0 && (state.cops.length > 0 || state.cars.some((c) => c.kind === 'police'))) {
    state.cops = [];
    state.cars = state.cars.filter((c) => c.kind !== 'police');
  }

  // Keep the police pressure matched to the wanted level.
  const wantCops = state.wantedStars >= 1 ? Math.min(state.wantedStars, 3) : 0;
  const wantCars = state.wantedStars >= 2 ? Math.min(state.wantedStars - 1, 3) : 0;
  while (state.cops.length < wantCops) {
    const a = state.rng.range(0, Math.PI * 2);
    spawnCop(state, state.player.x + Math.cos(a) * 500, state.player.y + Math.sin(a) * 500);
  }
  const policeCars = state.cars.filter((c) => c.kind === 'police').length;
  for (let i = policeCars; i < wantCars; i++) {
    const a = state.rng.range(0, Math.PI * 2);
    spawnPoliceCar(state, state.player.x + Math.cos(a) * 600, state.player.y + Math.sin(a) * 600);
  }

  updatePlayer(state, dt, input);
  updateTraffic(state, dt);
  updatePeds(state, dt);
  updateCops(state, dt);
  updatePoliceCars(state, dt);
  updateParticles(state, dt);
  updatePickups(state, dt);

  // Mission progress and its advance to the next one.
  const result = updateMission(state, dt);
  if (result === 'failed') state.audio.missionFail();
  if (result === 'complete') {
    state.mission.doneAt = state.time;
    saveGame(state);
  }
  if (state.mission.phase === 'done' && state.time > (state.mission.doneAt || 0) + 3) {
    if (state.mission.index + 1 < MISSION_DEFS.length) {
      state.mission.index++;
      state.mission.phase = 'idle';
    }
  }

  // Camera follows the player.
  const p = state.player;
  state.camera.x = clamp(p.x - VIEW_W / 2, 0, WORLD_W - VIEW_W);
  state.camera.y = clamp(p.y - VIEW_H / 2, 0, WORLD_H - VIEW_H);

  // Sound follows the drive and the sirens.
  const driving = !!p.car;
  state.audio.setEngine(driving ? Math.abs(p.car.speed) / 380 : 0, driving);
  state.audio.setSiren(state.wantedStars >= 2, dt);

  // Autosave every 15 seconds.
  state.saveTimer += dt;
  if (state.saveTimer > 15) {
    state.saveTimer = 0;
    saveGame(state);
  }
}

function updatePlayer(state, dt, input) {
  const p = state.player;
  state.prompt = '';
  state.punchCd -= dt;

  // --- on foot ---
  if (!p.car) {
    let mx = 0, my = 0;
    if (input.any(['KeyW', 'ArrowUp'])) my -= 1;
    if (input.any(['KeyS', 'ArrowDown'])) my += 1;
    if (input.any(['KeyA', 'ArrowLeft'])) mx -= 1;
    if (input.any(['KeyD', 'ArrowRight'])) mx += 1;
    if (mx || my) {
      const len = Math.hypot(mx, my);
      const run = input.down('ShiftLeft') || input.down('ShiftRight');
      const speed = run ? PLAYER_RUN_SPEED : PLAYER_WALK_SPEED;
      p.x += (mx / len) * speed * dt;
      p.y += (my / len) * speed * dt;
      p.angle = Math.atan2(my, mx);
    }
    resolveBuildingCollision(state.world, p, PLAYER_R);
    if (isWater(state.world, p.x, p.y)) {
      // The river is not swimmable: step back to the bank.
      p.y = 1560 - PLAYER_R;
    }
    // Pickups.
    for (const pk of state.world.pickups) {
      if (pk.taken) continue;
      if (dist(p.x, p.y, pk.x, pk.y) < 30) {
        pk.taken = true;
        if (pk.kind === 'health') p.hp = Math.min(100, p.hp + HEALTH_PICKUP);
        else state.ammo += AMMO_PICKUP;
        state.audio.pickup();
        addParticles(state, pk.x, pk.y, '#ffd24e', 8);
      }
    }
    // Punch.
    if (input.justPressed('KeyF') && state.punchCd <= 0) {
      state.punchCd = 0.35;
      punch(state);
    }
    // Shoot with the mouse.
    if (input.mouse.clicked) shoot(state, input);
  }

  // --- driving ---
  if (p.car) {
    const car = p.car;
    const fwd = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
    const accel = 420, maxSpeed = 380, maxReverse = 140;
    if (input.any(['KeyW', 'ArrowUp'])) car.speed += accel * dt;
    if (input.any(['KeyS', 'ArrowDown'])) {
      if (car.speed > 5) car.speed -= 600 * dt; // brake
      else car.speed -= 220 * dt; // reverse
    }
    if (!input.any(['KeyW', 'ArrowUp', 'KeyS', 'ArrowDown'])) {
      car.speed *= Math.max(0, 1 - 0.6 * dt);
    }
    if (input.down('Space')) car.speed *= Math.max(0, 1 - 1.8 * dt);
    car.speed = clamp(car.speed, -maxReverse, maxSpeed);
    const steer = (input.any(['KeyA', 'ArrowLeft']) ? -1 : 0) + (input.any(['KeyD', 'ArrowRight']) ? 1 : 0);
    const turnRate = (input.down('Space') ? 3.4 : 2.2) * clamp(Math.abs(car.speed) / 120, 0.15, 1);
    car.angle += steer * turnRate * dt * (car.speed < 0 ? -1 : 1);
    car.x += fwd.x * car.speed * dt;
    car.y += fwd.y * car.speed * dt;
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    // Building hits slow the car and damage it.
    if (resolveBuildingCollision(state.world, car, 24)) {
      if (Math.abs(car.speed) > 120) {
        car.hp -= 6;
        state.audio.crash();
        addParticles(state, car.x, car.y, '#888888', 10);
      }
      car.speed *= 0.5;
    }
    if (isWater(state.world, car.x, car.y)) {
      car.x -= fwd.x * car.speed * dt;
      car.y -= fwd.y * car.speed * dt;
      car.speed = 0;
    }
    // Run over a pedestrian at speed.
    for (const ped of state.peds) {
      if (ped.stay) continue;
      if (Math.abs(car.speed) > 80 && dist(car.x, car.y, ped.x, ped.y) < 30) {
        killPed(state, ped);
        crime(state, 12);
        car.speed *= 0.85;
      }
    }
    // Ram other cars.
    for (const other of state.cars) {
      if (other === car || other.kind === 'player') continue;
      const d = dist(car.x, car.y, other.x, other.y);
      if (d < 46 && d > 0.01) {
        const nx = (other.x - car.x) / d;
        const ny = (other.y - car.y) / d;
        const impact = Math.abs(car.speed - (other.speed || 0));
        other.x += nx * (46 - d) * 0.6;
        other.y += ny * (46 - d) * 0.6;
        car.x -= nx * (46 - d) * 0.4;
        car.y -= ny * (46 - d) * 0.4;
        if (impact > 150) {
          car.hp -= 5;
          other.hp -= 8;
          state.audio.crash();
          addParticles(state, (car.x + other.x) / 2, (car.y + other.y) / 2, '#ffaa33', 8);
        }
      }
    }
    if (input.mouse.clicked) shoot(state, input);
  }

  // Wrecked player car: Jax is thrown out on foot.
  if (p.car && p.car.hp <= 0) {
    addParticles(state, p.car.x, p.car.y, '#ff5a3c', 30);
    state.audio.crash();
    state.cars = state.cars.filter((c) => c !== p.car);
    state.playerCarObj = null;
    p.car = null;
    p.hp = Math.max(20, p.hp - 20);
  }

  // --- entering / leaving a car, missions, respray ---
  if (input.justPressed('KeyE')) {
    if (p.car) {
      // Step out; the car becomes ordinary traffic.
      const car = p.car;
      car.kind = 'traffic';
      car.node = nearestNode(state.world, car.x, car.y);
      car.next = state.world.neighbours[car.node][0];
      car.from = car.node;
      car.cruise = state.rng.range(60, 110);
      car.speed = 0;
      p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 40;
      p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 40;
      p.car = null;
      state.playerCarObj = null;
    } else {
      const car = nearestCar(state);
      if (car) {
        const policeSees = state.cops.some((c) => dist(c.x, c.y, p.x, p.y) < 450)
          || state.cars.some((c) => c.kind === 'police' && dist(c.x, c.y, p.x, p.y) < 450);
        if (car.kind !== 'player' && policeSees) crime(state, 15);
        state.cars = state.cars.filter((c) => c !== car);
        if (car.parkedRef) car.parkedRef.taken = true;
        car.kind = 'player';
        car.speed = 0;
        state.cars.push(car);
        state.playerCarObj = car;
        p.car = car;
        p.x = car.x;
        p.y = car.y;
        state.audio.click();
      }
    }
  }

  // Mission start marker.
  const m = state.mission;
  if (m.phase === 'idle' || m.phase === 'failed') {
    const s = missionStartPoint(m.index);
    if (dist(p.x, p.y, s.x, s.y) < 80) {
      state.prompt = 'Press E — Start mission: ' + MISSION_DEFS[m.index].name;
      if (input.justPressed('KeyE')) startMission(state, m.index);
    }
  }
  // Respray garage.
  const g = state.world.garage;
  if (p.car && state.heat > 0 && p.x > g.zone.x && p.x < g.zone.x + g.zone.w && p.y > g.zone.y && p.y < g.zone.y + g.zone.h) {
    if (state.money >= RESPRAY_COST) {
      state.prompt = 'Press E — Respray $' + RESPRAY_COST + ' (clears wanted level)';
      if (input.justPressed('KeyE')) {
        state.money -= RESPRAY_COST;
        state.heat = 0;
        state.audio.pickup();
        state.banner = { text: 'Fresh paint — the cops lost you.', until: state.time + 2.5 };
      }
    } else {
      state.prompt = 'Respray costs $' + RESPRAY_COST + ' — you cannot afford it yet.';
    }
  }

  // Caught or down?
  if (p.hp <= 0) {
    state.mode = 'down';
    state.audio.missionFail();
  }
}

function nearestCar(state) {
  const p = state.player;
  let best = null;
  let bestD = 80;
  for (const c of state.cars) {
    if (c.kind === 'player' || c.kind === 'police') continue;
    const d = dist(p.x, p.y, c.x, c.y);
    if (d < bestD) { bestD = d; best = c; }
  }
  for (const pk of state.world.parked) {
    if (pk.taken) continue;
    const d = dist(p.x, p.y, pk.x, pk.y);
    if (d < bestD) {
      bestD = d;
      best = { kind: 'traffic', x: pk.x, y: pk.y, angle: pk.angle, speed: 0, cruise: 90, color: pk.color, hp: 60, ramCd: 0, parkedRef: pk, node: 0, next: 0, from: 0 };
    }
  }
  return best;
}

function punch(state) {
  const p = state.player;
  const targets = [...state.peds, ...state.cops];
  for (const t of targets) {
    const d = dist(p.x, p.y, t.x, t.y);
    if (d > 46) continue;
    if (Math.abs(angleDiff(p.angle, angleTo(p.x, p.y, t.x, t.y))) > 1.1) continue;
    t.hp -= 25;
    addParticles(state, t.x, t.y, '#ffffff', 6);
    if (state.cops.includes(t)) crime(state, 10);
    else crime(state, 8);
    if (t.hp <= 0) {
      if (state.cops.includes(t)) {
        state.cops = state.cops.filter((c) => c !== t);
        crime(state, 25);
      } else {
        killPed(state, t);
      }
    }
  }
}

function shoot(state, input) {
  const p = state.player;
  if (state.ammo <= 0) {
    state.audio.click();
    return;
  }
  state.ammo--;
  state.audio.gunshot();
  state.lastShotAt = state.time;
  state.lastShotX = p.x;
  state.lastShotY = p.y;
  crime(state, 3);
  // Aim from the player toward the mouse, in world coordinates.
  const wx = state.camera.x + input.mouse.x;
  const wy = state.camera.y + input.mouse.y;
  const aim = angleTo(p.x, p.y, wx, wy);
  let best = null;
  let bestD = 460;
  const consider = (t, radius) => {
    const d = dist(p.x, p.y, t.x, t.y);
    if (d > bestD || d < 5) return;
    const ang = Math.abs(angleDiff(aim, angleTo(p.x, p.y, t.x, t.y)));
    if (ang < Math.atan2(radius + 6, d)) {
      bestD = d;
      best = t;
    }
  };
  for (const ped of state.peds) consider(ped, 12);
  for (const cop of state.cops) consider(cop, 12);
  for (const car of state.cars) {
    if (car.kind === 'player') continue;
    consider(car, 26);
  }
  // Muzzle flash.
  addParticles(state, p.x + Math.cos(aim) * 24, p.y + Math.sin(aim) * 24, '#ffe08a', 5);
  if (!best) return;
  addParticles(state, best.x, best.y, '#ff3b30', 10);
  if (best.hp !== undefined) {
    best.hp -= 34;
    if (best.hp <= 0) {
      if (state.cops.includes(best)) {
        state.cops = state.cops.filter((c) => c !== best);
        crime(state, 25);
      } else if (state.peds.includes(best)) {
        killPed(state, best);
        crime(state, 12);
      } else {
        // A car was destroyed.
        addParticles(state, best.x, best.y, '#ff5a3c', 30);
        state.audio.crash();
        state.cars = state.cars.filter((c) => c !== best);
      }
    }
  }
}

function killPed(state, ped) {
  addParticles(state, ped.x, ped.y, '#e07a5f', 12);
  state.peds = state.peds.filter((x) => x !== ped);
  // A fresh pedestrian wanders in after a while.
  setTimeout(() => {
    if (state.peds.length < 30) state.peds.push(makePed(state));
  }, 8000);
}

function updateTraffic(state, dt) {
  for (const car of state.cars) {
    if (car.kind !== 'traffic' && car.kind !== 'target') continue;
    const target = state.world.nodes[car.next];
    const d = dist(car.x, car.y, target.x, target.y);
    // Slow down for the car ahead.
    let blocked = false;
    for (const other of state.cars) {
      if (other === car) continue;
      const od = dist(car.x, car.y, other.x, other.y);
      if (od < 60) {
        const ahead = Math.cos(car.angle) * (other.x - car.x) + Math.sin(car.angle) * (other.y - car.y);
        if (ahead > 0) blocked = true;
      }
    }
    const wantSpeed = blocked ? 0 : car.cruise;
    car.speed += (wantSpeed - car.speed) * Math.min(1, dt * 1.5);
    car.angle = angleTo(car.x, car.y, target.x, target.y);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    if (d < 14) {
      car.from = car.node;
      car.node = car.next;
      const options = state.world.neighbours[car.node].filter((n) => n !== car.from);
      car.next = options.length > 0
        ? options[state.rng.int(0, options.length - 1)]
        : car.from;
    }
    if (car.hp <= 0 && car.kind === 'target') {
      addParticles(state, car.x, car.y, '#ff5a3c', 30);
      state.audio.crash();
      state.cars = state.cars.filter((c) => c !== car);
    }
  }
  // Gentle separation so traffic does not stack up.
  for (let i = 0; i < state.cars.length; i++) {
    for (let j = i + 1; j < state.cars.length; j++) {
      const a = state.cars[i];
      const b = state.cars[j];
      if (a.kind === 'player' || b.kind === 'player') continue;
      const d = dist(a.x, a.y, b.x, b.y);
      if (d < 40 && d > 0.01) {
        const nx = (b.x - a.x) / d;
        const ny = (b.y - a.y) / d;
        a.x -= nx * (40 - d) * 0.25;
        a.y -= ny * (40 - d) * 0.25;
        b.x += nx * (40 - d) * 0.25;
        b.y += ny * (40 - d) * 0.25;
      }
    }
  }
}

function updatePeds(state, dt) {
  for (const ped of state.peds) {
    if (ped.stay) continue;
    // Flee from gunfire and from speeding cars.
    if (!ped.fleeing) {
      if (state.time - state.lastShotAt < 1.5 && dist(ped.x, ped.y, state.lastShotX, state.lastShotY) < 350) {
        ped.fleeing = true;
        ped.fleeUntil = state.time + 2;
      }
      for (const car of state.cars) {
        if (Math.abs(car.speed || 0) > 150 && dist(ped.x, ped.y, car.x, car.y) < 90) {
          ped.fleeing = true;
          ped.fleeUntil = state.time + 1.5;
        }
      }
    }
    if (ped.fleeing) {
      if (state.time > ped.fleeUntil) {
        ped.fleeing = false;
      } else {
        const threat = state.player.car || state.player;
        const a = angleTo(threat.x, threat.y, ped.x, ped.y);
        ped.x += Math.cos(a) * 200 * dt;
        ped.y += Math.sin(a) * 200 * dt;
        resolveBuildingCollision(state.world, ped, 10);
        continue;
      }
    }
    const d = dist(ped.x, ped.y, ped.tx, ped.ty);
    if (d < 12) {
      const n = state.world.nodes[state.rng.int(0, state.world.nodes.length - 1)];
      ped.tx = n.x + state.rng.range(-70, 70);
      ped.ty = n.y + state.rng.range(-70, 70);
    } else {
      const a = angleTo(ped.x, ped.y, ped.tx, ped.ty);
      ped.x += Math.cos(a) * ped.speed * dt;
      ped.y += Math.sin(a) * ped.speed * dt;
    }
    resolveBuildingCollision(state.world, ped, 10);
  }
}

function updateCops(state, dt) {
  const p = state.player;
  for (const cop of state.cops) {
    // Chase on foot, sliding around buildings.
    const a = angleTo(cop.x, cop.y, p.x, p.y);
    const speed = 150;
    const oldX = cop.x;
    const oldY = cop.y;
    cop.x += Math.cos(a) * speed * dt;
    if (hitBuilding(state.world, cop.x, cop.y, 11)) cop.x = oldX;
    cop.y += Math.sin(a) * speed * dt;
    if (hitBuilding(state.world, cop.x, cop.y, 11)) cop.y = oldY;
    // Catch the player on foot.
    cop.punchCd -= dt;
    if (!p.car && dist(cop.x, cop.y, p.x, p.y) < 26) {
      state.mode = 'caught';
      state.audio.missionFail();
      return;
    }
    if (!p.car && dist(cop.x, cop.y, p.x, p.y) < 40 && cop.punchCd <= 0) {
      cop.punchCd = 0.8;
      p.hp -= 12;
      addParticles(state, p.x, p.y, '#ff3b30', 6);
    }
  }
}

function updatePoliceCars(state, dt) {
  const p = state.player;
  for (const car of state.cars) {
    if (car.kind !== 'police') continue;
    car.ramCd -= dt;
    const dPlayer = dist(car.x, car.y, p.x, p.y);
    if (dPlayer < 130) {
      // Ram straight at the player.
      car.angle = angleTo(car.x, car.y, p.x, p.y);
      car.speed = Math.min(car.speed + 300 * dt, 260);
    } else {
      // Drive the road graph toward the player's nearest intersection.
      const targetNode = nearestNode(state.world, p.x, p.y);
      const target = state.world.nodes[car.next];
      const d = dist(car.x, car.y, target.x, target.y);
      car.speed += (car.cruise - car.speed) * Math.min(1, dt * 1.2);
      car.angle = angleTo(car.x, car.y, target.x, target.y);
      if (d < 16) {
        car.from = car.node;
        car.node = car.next;
        const options = state.world.neighbours[car.node];
        let best = options[0];
        let bestD = Infinity;
        for (const n of options) {
          const nd = dist(state.world.nodes[n].x, state.world.nodes[n].y, state.world.nodes[targetNode].x, state.world.nodes[targetNode].y);
          if (nd < bestD) { bestD = nd; best = n; }
        }
        car.next = best;
      }
    }
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    resolveBuildingCollision(state.world, car, 24);
    // Ram the player's car, or knock Jax down on foot.
    if (dPlayer < 46 && car.ramCd <= 0) {
      car.ramCd = 0.6;
      if (p.car) {
        p.car.hp -= 12;
        car.hp -= 4;
        state.audio.crash();
        addParticles(state, p.x, p.y, '#ffaa33', 10);
      } else {
        p.hp -= 20;
        addParticles(state, p.x, p.y, '#ff3b30', 10);
      }
    }
  }
}

function updateParticles(state, dt) {
  for (const pt of state.particles) {
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
  }
  state.particles = state.particles.filter((pt) => pt.life > 0);
}

function updatePickups(state, dt) {
  // Restock one taken pickup every 45 seconds so the city never runs dry.
  state.pickupTimer += dt;
  if (state.pickupTimer > 45) {
    state.pickupTimer = 0;
    const taken = state.world.pickups.filter((p) => p.taken);
    if (taken.length > 0) {
      const pk = taken[state.rng.int(0, taken.length - 1)];
      const n = state.world.nodes[state.rng.int(0, state.world.nodes.length - 1)];
      pk.x = n.x + state.rng.range(-70, 70);
      pk.y = n.y + state.rng.range(-70, 70);
      pk.taken = false;
    }
  }
}

// ---- save / load ----

function saveGame(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: state.money, hp: state.player.hp, ammo: state.ammo,
      missionIndex: state.mission.index, missionPhase: state.mission.phase,
      px: state.player.x, py: state.player.y, time: state.time, heat: state.heat,
    }));
  } catch (err) { /* storage unavailable: the game still plays */ }
}

function loadGame(state) {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    state.money = s.money;
    state.player.hp = s.hp;
    state.ammo = s.ammo;
    state.mission.index = s.missionIndex;
    state.mission.phase = s.missionPhase === 'active' ? 'idle' : s.missionPhase;
    state.player.x = s.px;
    state.player.y = s.py;
    state.time = s.time || 0;
    state.heat = s.heat || 0;
    return true;
  } catch (err) {
    return false;
  }
}

// ---- boot ----

export function boot() {
  const canvas = document.getElementById('game');
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  const ctx = canvas.getContext('2d');
  const params = new URLSearchParams(window.location.search);
  const seed = Number(params.get('seed')) || SEED;
  const shot = params.get('shot');
  const input = new Input(canvas);
  const state = createState(seed);
  state.input = input;
  state.shot = shot;
  // A small debug hook for automated play-testing (harmless in play).
  window.__neon = state;
  // Attach the helpers the staging module and the missions use.
  state.playerCar = () => playerCar(state);
  state.spawnPoliceCar = (x, y) => spawnPoliceCar(state, x, y);
  state.spawnCop = (x, y) => spawnCop(state, x, y);
  state.spawnTargetCar = () => spawnTargetCar(state);
  input.onFirstGesture = () => state.audio.init();
  try {
    state.hasSave = !!localStorage.getItem(SAVE_KEY);
  } catch (err) {
    state.hasSave = false;
  }

  if (shot) applyShot(state, shot);

  let last = performance.now();
  let firstFrame = true;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (input.justPressed('KeyM')) {
      state.audio.setMuted(!state.audio.muted);
    }

    if (state.mode === 'title') {
      if (input.justPressed('Enter')) {
        if (state.hasSave && !input.down('KeyN')) {
          if (loadGame(state)) state.mode = 'playing';
          else state.mode = 'playing';
        } else {
          state.mode = 'playing';
        }
        state.audio.init();
        state.audio.click();
      }
      if (input.justPressed('KeyN')) {
        state.mode = 'playing';
        state.audio.init();
        state.audio.click();
      }
    } else if (state.mode === 'playing') {
      if (input.justPressed('KeyP') || input.justPressed('Escape')) {
        state.mode = 'paused';
        state.audio.click();
      } else {
        update(state, dt, input);
      }
    } else if (state.mode === 'paused') {
      if (input.justPressed('KeyP') || input.justPressed('Escape')) {
        state.mode = 'playing';
        state.audio.click();
      }
    } else if (state.mode === 'caught' || state.mode === 'down') {
      if (input.justPressed('Enter')) {
        const cost = Math.min(state.money, state.bailCost);
        state.money -= cost;
        state.player.hp = 100;
        state.heat = 0;
        state.cops = [];
        state.cars = state.cars.filter((c) => c.kind !== 'police');
        if (state.player.car) {
          state.player.car.hp = 100;
        }
        state.player.x = 1250;
        state.player.y = 1300;
        if (state.mission.phase === 'active') state.mission.phase = 'failed';
        state.mode = 'playing';
        state.audio.click();
        saveGame(state);
      }
      if (input.justPressed('KeyR')) {
        const fresh = createState(seed);
        Object.assign(state, fresh, { mode: 'playing', input, audio: state.audio });
        state.playerCar = () => playerCar(state);
        state.spawnPoliceCar = (x, y) => spawnPoliceCar(state, x, y);
        state.spawnCop = (x, y) => spawnCop(state, x, y);
        state.spawnTargetCar = () => spawnTargetCar(state);
      }
    }

    draw(ctx, state);
    if (firstFrame) {
      firstFrame = false;
      window.__gameReady = true;
    }
    input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
