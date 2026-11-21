// All drawing: the city, cars, pedestrians, particles, the HUD with minimap,
// and the title / pause / caught / down / mission screens. Canvas 2D only.

import { WORLD_W, WORLD_H, VIEW_W, VIEW_H, ROAD_W, RIVER_TOP, PALETTE, RESPRAY_COST } from './config.js';
import { currentMarker, objectiveText, MISSION_DEFS } from './missions.js';
import { clamp } from './random.js';

const MINIMAP_W = 220;
const MINIMAP_H = 165;

export function draw(ctx, state) {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  if (state.mode === 'title') {
    drawTitle(ctx, state);
    return;
  }
  drawWorld(ctx, state);
  drawMarkers(ctx, state);
  drawPickups(ctx, state);
  drawCars(ctx, state);
  drawPeds(ctx, state);
  drawPlayer(ctx, state);
  drawParticles(ctx, state);
  drawHud(ctx, state);
  if (state.mode === 'paused') drawPaused(ctx, state);
  if (state.mode === 'caught') drawEndScreen(ctx, state, 'CAUGHT', 'The Aurora Bay police took you in.', 'Press ENTER to pay $' + state.bailCost + ' bail and walk free, or R to restart.');
  if (state.mode === 'down') drawEndScreen(ctx, state, 'YOU\'RE DOWN', 'Jax is out cold. Aurora Bay keeps moving.', 'Press ENTER to get back up ($' + state.bailCost + ' hospital bill), or R to restart.');
}

// ---- world ----

function drawWorld(ctx, state) {
  const cam = state.camera;
  const world = state.world;
  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  // Ground and water.
  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(0, RIVER_TOP, WORLD_W, WORLD_H - RIVER_TOP);
  // Waterfront promenade.
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(0, 1424, WORLD_W, RIVER_TOP - 1424);

  // Parks.
  for (const p of world.parks) {
    ctx.fillStyle = PALETTE.park;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = '#2a7a2e';
    for (const t of p.trees) {
      ctx.beginPath();
      ctx.arc(t.x, t.y, 9, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Roads with edges and centre dashes.
  for (const r of world.roads) {
    ctx.fillStyle = PALETTE.roadEdge;
    ctx.fillRect(r.x - 6, r.y - 6, r.w + 12, r.h + 12);
    ctx.fillStyle = PALETTE.road;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = PALETTE.lane;
    if (r.vertical) {
      for (let y = r.y + 20; y < r.y + r.h - 10; y += 44) {
        ctx.fillRect(r.x + r.w / 2 - 2, y, 4, 22);
      }
    } else {
      for (let x = r.x + 20; x < r.x + r.w - 10; x += 44) {
        ctx.fillRect(x, r.y + r.h / 2 - 2, 22, 4);
      }
    }
  }

  // Buildings: roof colour, dark edge, a lighter inner roof.
  for (const b of world.buildings) {
    ctx.fillStyle = PALETTE.buildingEdge;
    ctx.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, Math.min(18, b.h - 12));
  }

  // Respray garage: purple roof, "SPRAY" sign, drive-in zone outline.
  const g = world.garage;
  ctx.strokeStyle = '#c9a0ff';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.strokeRect(g.zone.x, g.zone.y, g.zone.w, g.zone.h);
  ctx.setLineDash([]);
  ctx.fillStyle = '#e8d5ff';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SPRAY $' + RESPRAY_COST, g.x + g.w / 2, g.y + g.h / 2 + 7);

  ctx.restore();
}

// ---- markers, pickups, entities ----

function drawMarkers(ctx, state) {
  const cam = state.camera;
  const marker = currentMarker(state);
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  if (marker) {
    const pulse = 1 + Math.sin(state.time * 4) * 0.15;
    ctx.strokeStyle = marker.kind === 'start' ? '#ffd24e' : '#ff5a4e';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(marker.x, marker.y, 26 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = marker.kind === 'start' ? '#ffd24e' : '#ff5a4e';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(marker.kind === 'start' ? 'M' : '!', marker.x, marker.y + 8);
  }
  // Mission targets (packages, stops, fares) get small diamonds.
  const m = state.mission;
  if (m.phase === 'active') {
    for (const t of m.targets) {
      if (t.done || t.kind === 'wreck') continue;
      ctx.fillStyle = '#ff5a4e';
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-8, -8, 16, 16);
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawPickups(ctx, state) {
  const cam = state.camera;
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  for (const p of state.world.pickups) {
    if (p.taken) continue;
    if (p.kind === 'health') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(p.x - 11, p.y - 11, 22, 22);
      ctx.fillStyle = '#2fae4e';
      ctx.fillRect(p.x - 3, p.y - 9, 6, 18);
      ctx.fillRect(p.x - 9, p.y - 3, 18, 6);
    } else {
      ctx.fillStyle = '#ffd24e';
      ctx.fillRect(p.x - 11, p.y - 7, 22, 14);
      ctx.fillStyle = '#7a5a00';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('AMMO', p.x, p.y + 4);
    }
  }
  ctx.restore();
}

function drawCarShape(ctx, car) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Shadow, body, windshield, roof.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(-22, -10, 46, 26);
  ctx.fillStyle = car.color;
  ctx.fillRect(-24, -13, 48, 26);
  ctx.fillStyle = '#1c2733';
  ctx.fillRect(-4, -11, 12, 22);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(-20, -11, 8, 22);
  if (car.kind === 'police') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-24, -13, 48, 6);
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(-24, 7, 48, 6);
    const blink = Math.floor(Date.now() / 250) % 2 === 0;
    ctx.fillStyle = blink ? '#ff3b30' : '#2e6ff2';
    ctx.fillRect(-2, -15, 6, 4);
  }
  if (car.target) {
    ctx.strokeStyle = '#ff3b30';
    ctx.lineWidth = 3;
    ctx.strokeRect(-26, -15, 52, 30);
  }
  ctx.restore();
  // Damage smoke.
  if (car.hp < 40 && car.hp > 0) {
    ctx.fillStyle = 'rgba(120,120,120,0.7)';
    ctx.beginPath();
    ctx.arc(car.x - Math.cos(car.angle) * 20, car.y - Math.sin(car.angle) * 20, 8, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCars(ctx, state) {
  const cam = state.camera;
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  for (const car of state.cars) drawCarShape(ctx, car);
  for (const car of state.world.parked) {
    if (car.taken) continue;
    drawCarShape(ctx, { x: car.x, y: car.y, angle: car.angle, color: car.color, kind: 'parked', hp: 100 });
  }
  ctx.restore();
}

function drawPeds(ctx, state) {
  const cam = state.camera;
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  for (const p of state.peds) {
    ctx.fillStyle = p.fleeing ? '#ff8a5a' : p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(p.x, p.y - 2, 5, 0, Math.PI * 2);
    ctx.fill();
    if (p.fare) {
      ctx.fillStyle = '#ffd24e';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', p.x, p.y - 16);
    }
  }
  for (const c of state.cops) {
    ctx.fillStyle = '#1c4fd6';
    ctx.beginPath();
    ctx.arc(c.x, c.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PD', c.x, c.y + 3);
  }
  ctx.restore();
}

function drawPlayer(ctx, state) {
  const cam = state.camera;
  const p = state.player;
  if (p.car) return; // drawn as the car itself
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  ctx.fillStyle = PALETTE.playerColor;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x + Math.cos(p.angle) * 20, p.y + Math.sin(p.angle) * 20);
  ctx.stroke();
  ctx.restore();
}

function drawParticles(ctx, state) {
  const cam = state.camera;
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  for (const pt of state.particles) {
    ctx.fillStyle = pt.color;
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillRect(pt.x - 3, pt.y - 3, 6, 6);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ---- HUD ----

function drawHud(ctx, state) {
  const p = state.player;
  // Health bar.
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(16, 16, 220, 54);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('JAX', 26, 36);
  ctx.fillStyle = '#333';
  ctx.fillRect(26, 44, 180, 12);
  ctx.fillStyle = p.hp > 40 ? '#2fae4e' : '#e03b2e';
  ctx.fillRect(26, 44, 180 * clamp(p.hp / 100, 0, 1), 12);
  // Money.
  ctx.fillStyle = '#ffd24e';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('$' + state.money, 26, 88);

  // Wanted stars, top right.
  const stars = state.wantedStars;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(VIEW_W - 236, 16, 220, 44);
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'left';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < stars ? '#ffd24e' : '#555';
    ctx.fillText('★', VIEW_W - 224 + i * 42, 48);
  }

  // Clock.
  const hours = 8 + Math.floor(state.time / 60) % 16;
  const mins = Math.floor(state.time) % 60;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(String(hours).padStart(2, '0') + ':' + String(mins).padStart(2, '0'), VIEW_W - 24, 88);

  // Mission objective bar.
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(16, VIEW_H - 64, VIEW_W - 32, 48);
  ctx.fillStyle = '#ffffff';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(objectiveText(state), 30, VIEW_H - 34);

  // Speed + ammo when driving / on foot.
  if (p.car) {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(Math.abs(p.car.speed) * 2.2) + ' mph', VIEW_W - 260, VIEW_H - 80);
  } else {
    ctx.fillStyle = '#ffd24e';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('AMMO ' + state.ammo, VIEW_W - 260, VIEW_H - 80);
  }

  // Context prompt.
  if (state.prompt) {
    ctx.fillStyle = '#ffd24e';
    ctx.font = 'bold 17px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(state.prompt, VIEW_W / 2, VIEW_H - 84);
  }

  // Banner (mission complete etc).
  if (state.banner && state.time < state.banner.until) {
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(VIEW_W / 2 - 320, 110, 640, 46);
    ctx.fillStyle = '#ffd24e';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(state.banner.text, VIEW_W / 2, 140);
  }

  drawMinimap(ctx, state);
}

function drawMinimap(ctx, state) {
  const x0 = 16;
  const y0 = VIEW_H - MINIMAP_H - 84;
  const sx = MINIMAP_W / WORLD_W;
  const sy = MINIMAP_H / WORLD_H;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x0 - 4, y0 - 4, MINIMAP_W + 8, MINIMAP_H + 8);
  ctx.fillStyle = '#1e5f8a';
  ctx.fillRect(x0, y0, MINIMAP_W, MINIMAP_H);
  ctx.fillStyle = '#3f7a44';
  ctx.fillRect(x0, y0, MINIMAP_W, MINIMAP_H * (RIVER_TOP / WORLD_H));
  ctx.fillStyle = '#2b2e36';
  for (const r of state.world.roads) {
    ctx.fillRect(x0 + r.x * sx, y0 + r.y * sy, Math.max(2, r.w * sx), Math.max(2, r.h * sy));
  }
  const marker = currentMarker(state);
  if (marker) {
    ctx.fillStyle = marker.kind === 'start' ? '#ffd24e' : '#ff5a4e';
    ctx.beginPath();
    ctx.arc(x0 + marker.x * sx, y0 + marker.y * sy, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const c of state.cars) {
    if (c.kind !== 'police') continue;
    ctx.fillStyle = '#2e6ff2';
    ctx.beginPath();
    ctx.arc(x0 + c.x * sx, y0 + c.y * sy, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  const p = state.player;
  ctx.fillStyle = '#ffd24e';
  ctx.beginPath();
  ctx.arc(x0 + p.x * sx, y0 + p.y * sy, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x0 + p.x * sx, y0 + p.y * sy, 7, 0, Math.PI * 2);
  ctx.stroke();
}

// ---- screens ----

function drawTitle(ctx, state) {
  ctx.fillStyle = '#0d1526';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // Skyline silhouette.
  ctx.fillStyle = '#16233f';
  const base = 560;
  let x = 0;
  const rngHeights = [180, 260, 150, 300, 210, 340, 170, 280, 200, 320, 160, 250];
  for (const h of rngHeights) {
    ctx.fillRect(x, base - h, 104, h);
    x += 108;
  }
  ctx.fillStyle = '#ff9a3c';
  ctx.beginPath();
  ctx.arc(1040, 180, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd24e';
  ctx.font = 'bold 96px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('NEON HARBOR', VIEW_W / 2, 300);
  ctx.fillStyle = '#ffffff';
  ctx.font = '28px sans-serif';
  ctx.fillText('An open-world crime game in Aurora Bay', VIEW_W / 2, 350);
  ctx.font = '19px sans-serif';
  ctx.fillStyle = '#c8d0e0';
  const lines = [
    'WASD / Arrows — move and drive    Shift — run    Space — handbrake',
    'E — enter / steal a car, start a mission, respray    F — punch    Click — shoot',
    'M — mute    P / Esc — pause    Steal cars, dodge the police, finish all 6 missions.',
  ];
  lines.forEach((l, i) => ctx.fillText(l, VIEW_W / 2, 420 + i * 32));
  ctx.fillStyle = '#ffd24e';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText(state.hasSave ? 'Press ENTER — Continue    or    N — New Game' : 'Press ENTER — New Game', VIEW_W / 2, 560);
  ctx.fillStyle = '#8a94a8';
  ctx.font = '15px sans-serif';
  ctx.fillText('An original game. No real city, person or brand appears in it.', VIEW_W / 2, 640);
}

function drawPaused(ctx, state) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 52px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PAUSED', VIEW_W / 2, VIEW_H / 2 - 20);
  ctx.font = '20px sans-serif';
  ctx.fillText('Press P or Esc to keep playing.  M mutes the sound.', VIEW_W / 2, VIEW_H / 2 + 30);
}

function drawEndScreen(ctx, state, title, sub, hint) {
  ctx.fillStyle = 'rgba(10,0,0,0.72)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = '#ff5a4e';
  ctx.font = 'bold 72px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, VIEW_W / 2, VIEW_H / 2 - 40);
  ctx.fillStyle = '#ffffff';
  ctx.font = '22px sans-serif';
  ctx.fillText(sub, VIEW_W / 2, VIEW_H / 2 + 10);
  ctx.fillStyle = '#ffd24e';
  ctx.font = '19px sans-serif';
  ctx.fillText(hint, VIEW_W / 2, VIEW_H / 2 + 60);
}
