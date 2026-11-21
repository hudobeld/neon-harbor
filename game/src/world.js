// Aurora Bay: seeded city generation — streets, blocks, buildings, parks,
// the south waterfront and river with two bridges, plus the road graph that
// traffic and police drive on, and the collision helpers the game uses.

import {
  WORLD_W, WORLD_H, ROAD_W, VERTICAL_ROADS, HORIZONTAL_ROADS,
  RIVER_TOP, BRIDGE_X, PALETTE,
} from './config.js';
import { makeRng, clamp } from './random.js';

// A road is an axis-aligned rectangle; a building is one too, with a colour.
export function buildWorld(seed) {
  const rng = makeRng(seed);
  const roads = [];
  const nodes = []; // intersections: {x, y}
  const nodeIndex = new Map();

  // Vertical avenues. Bridge avenues run all the way across the river.
  for (const vx of VERTICAL_ROADS) {
    const crosses = BRIDGE_X.includes(vx);
    roads.push({
      x: vx - ROAD_W / 2, y: 0, w: ROAD_W,
      h: crosses ? WORLD_H : HORIZONTAL_ROADS[HORIZONTAL_ROADS.length - 1] + ROAD_W / 2,
      vertical: true, cx: vx,
    });
  }
  // Horizontal streets stop at the riverbank.
  for (const hy of HORIZONTAL_ROADS) {
    roads.push({ x: 0, y: hy - ROAD_W / 2, w: WORLD_W, h: ROAD_W, vertical: false, cy: hy });
  }

  // Every avenue/street crossing is a graph node; neighbours are the adjacent
  // crossings on the same road.
  for (const vx of VERTICAL_ROADS) {
    for (const hy of HORIZONTAL_ROADS) {
      const key = vx + ',' + hy;
      nodeIndex.set(key, nodes.length);
      nodes.push({ x: vx, y: hy });
    }
  }
  const neighbours = nodes.map((n) => {
    const out = [];
    for (const m of nodes) {
      if (m === n) continue;
      const sameCol = m.x === n.x && Math.abs(m.y - n.y) <= 320;
      const sameRow = m.y === n.y && Math.abs(m.x - n.x) <= 380;
      if (sameCol || sameRow) out.push(nodeIndex.get(m.x + ',' + m.y));
    }
    return out;
  });

  // City blocks: the rectangles between neighbouring roads. A few become parks;
  // the rest get one to three buildings each.
  const buildings = [];
  const parks = [];
  const colEdges = [0, ...VERTICAL_ROADS, WORLD_W];
  const rowEdges = [0, ...HORIZONTAL_ROADS, RIVER_TOP];
  for (let ci = 0; ci < colEdges.length - 1; ci++) {
    for (let ri = 0; ri < rowEdges.length - 1; ri++) {
      const bx0 = colEdges[ci] + ROAD_W / 2 + 10;
      const bx1 = colEdges[ci + 1] - ROAD_W / 2 - 10;
      const by0 = rowEdges[ri] + ROAD_W / 2 + 10;
      const by1 = rowEdges[ri + 1] - ROAD_W / 2 - 10;
      if (bx1 - bx0 < 90 || by1 - by0 < 90) continue;
      // The block holding the respray garage stays a plain block.
      const isGarageBlock = ci === 3 && ri === 3;
      if (!isGarageBlock && rng.chance(0.14)) {
        const park = { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0, trees: [] };
        const treeCount = Math.floor((park.w * park.h) / 9000);
        for (let t = 0; t < treeCount; t++) {
          park.trees.push({ x: rng.range(bx0 + 14, bx1 - 14), y: rng.range(by0 + 14, by1 - 14) });
        }
        parks.push(park);
        continue;
      }
      const count = rng.int(1, 3);
      if (count === 1) {
        buildings.push(makeBuilding(rng, bx0, by0, bx1 - bx0, by1 - by0));
      } else if (count === 2) {
        const splitV = rng.chance(0.5);
        if (splitV) {
          const mid = (bx0 + bx1) / 2;
          buildings.push(makeBuilding(rng, bx0, by0, mid - bx0 - 8, by1 - by0));
          buildings.push(makeBuilding(rng, mid + 8, by0, bx1 - mid - 8, by1 - by0));
        } else {
          const mid = (by0 + by1) / 2;
          buildings.push(makeBuilding(rng, bx0, by0, bx1 - bx0, mid - by0 - 8));
          buildings.push(makeBuilding(rng, bx0, mid + 8, bx1 - bx0, by1 - mid - 8));
        }
      } else {
        const mx = (bx0 + bx1) / 2;
        const my = (by0 + by1) / 2;
        buildings.push(makeBuilding(rng, bx0, by0, mx - bx0 - 6, my - by0 - 6));
        buildings.push(makeBuilding(rng, mx + 6, by0, bx1 - mx - 6, my - by0 - 6));
        buildings.push(makeBuilding(rng, bx0, my + 6, mx - bx0 - 6, by1 - my - 6));
        buildings.push(makeBuilding(rng, mx + 6, my + 6, bx1 - mx - 6, by1 - my - 6));
      }
    }
  }

  // The respray garage: a purple-roofed building with a drive-in zone in front.
  const garage = {
    x: 1294, y: 1124, w: 150, h: 110,
    zone: { x: 1294, y: 1234, w: 150, h: 90 },
    color: '#7a3fae',
  };
  buildings.push({ x: garage.x, y: garage.y, w: garage.w, h: garage.h, color: garage.color });

  // Health and ammo pickups, placed on sidewalks near intersections.
  const pickups = [];
  for (let i = 0; i < 10; i++) {
    const n = rng.pick(nodes);
    pickups.push({ kind: 'health', x: n.x + rng.range(-70, 70), y: n.y + rng.range(-70, 70), taken: false });
  }
  for (let i = 0; i < 10; i++) {
    const n = rng.pick(nodes);
    pickups.push({ kind: 'ammo', x: n.x + rng.range(-70, 70), y: n.y + rng.range(-70, 70), taken: false });
  }

  // Parked cars along the road edges.
  const parked = [];
  for (let i = 0; i < 12; i++) {
    const n = rng.pick(nodes);
    const vertical = rng.chance(0.5);
    parked.push({
      x: n.x + (vertical ? rng.pick([-56, 56]) : rng.range(-120, 120)),
      y: n.y + (vertical ? rng.range(-120, 120) : rng.pick([-56, 56])),
      angle: vertical ? Math.PI / 2 : 0,
      color: rng.pick(PALETTE.carColors),
      parked: true,
    });
  }

  return { seed, rng, roads, nodes, neighbours, buildings, parks, garage, pickups, parked };
}

function makeBuilding(rng, x, y, w, h) {
  const inset = rng.range(4, 14);
  return {
    x: x + inset, y: y + inset,
    w: Math.max(40, w - inset * 2), h: Math.max(40, h - inset * 2),
    color: rng.pick(PALETTE.buildingRoof),
  };
}

// True when a point is on a road (or on a bridge over the river).
export function isOnRoad(world, x, y) {
  for (const r of world.roads) {
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
  }
  return false;
}

// True when a point is in the river (not on a bridge).
export function isWater(world, x, y) {
  if (y < RIVER_TOP) return false;
  return !isOnRoad(world, x, y);
}

// Circle-vs-buildings test; returns the first building hit, or null.
export function hitBuilding(world, x, y, r) {
  for (const b of world.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
  }
  return null;
}

// Push a circle out of any building it overlaps; also clamps it to the world.
export function resolveBuildingCollision(world, pos, r) {
  const b = hitBuilding(world, pos.x, pos.y, r);
  if (b) {
    const left = pos.x + r - b.x;
    const right = b.x + b.w - (pos.x - r);
    const top = pos.y + r - b.y;
    const bottom = b.y + b.h - (pos.y - r);
    const min = Math.min(left, right, top, bottom);
    if (min === left) pos.x = b.x - r;
    else if (min === right) pos.x = b.x + b.w + r;
    else if (min === top) pos.y = b.y - r;
    else pos.y = b.y + b.h + r;
    return true;
  }
  pos.x = clamp(pos.x, r, WORLD_W - r);
  pos.y = clamp(pos.y, r, WORLD_H - r);
  return false;
}

// Nearest graph node to a point.
export function nearestNode(world, x, y) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < world.nodes.length; i++) {
    const n = world.nodes[i];
    const d = (n.x - x) * (n.x - x) + (n.y - y) * (n.y - y);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// A random point on a sidewalk beside a random intersection.
export function randomSidewalkPoint(world, rng) {
  const n = rng.pick(world.nodes);
  return { x: n.x + rng.range(-80, 80), y: n.y + rng.range(-80, 80) };
}
