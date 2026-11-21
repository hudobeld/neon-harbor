// The story chain: six missions for Jax, driver-for-hire in Aurora Bay.
// Each mission is a small state machine over the shared game state. The game
// (main.js) owns the entities; this module only sets up targets, watches the
// objectives and reports completion or failure.

import { MISSION_REWARDS } from './config.js';
import { nearestNode, randomSidewalkPoint } from './world.js';
import { dist } from './random.js';

export const MISSION_DEFS = [
  {
    id: 1, name: 'Harbor Run',
    intro: 'Mara needs a courier at the north docks. Drive to the marker before the clock runs out.',
    type: 'goto', timeLimit: 75,
    start: { x: 1250, y: 1380 },
    target: { x: 2300, y: 180 },
  },
  {
    id: 2, name: 'Package Pickup',
    intro: 'Three parcels are stashed around the city. Collect them all.',
    type: 'collect', timeLimit: 150, count: 3,
    start: { x: 550, y: 480 },
  },
  {
    id: 3, name: 'Heat Wave',
    intro: 'The cops are onto you — three stars and climbing. Lose the heat.',
    type: 'loseWanted', timeLimit: 180,
    start: { x: 1600, y: 780 },
  },
  {
    id: 4, name: 'Wrecking Crew',
    intro: 'A rival crew left three cars on the streets. Wreck them all.',
    type: 'destroy', timeLimit: 180, count: 3,
    start: { x: 900, y: 1080 },
  },
  {
    id: 5, name: 'Cab Call',
    intro: 'The dispatch app is buzzing. Pick up three fares and drop them off.',
    type: 'taxi', timeLimit: 200, count: 3,
    start: { x: 200, y: 780 },
  },
  {
    id: 6, name: 'The Big Score',
    intro: 'One last job: hit three stops in order, then vanish at the hideout.',
    type: 'stops', timeLimit: 240,
    start: { x: 1950, y: 480 },
    stops: [
      { x: 200, y: 180 },
      { x: 2300, y: 1080 },
      { x: 550, y: 1380 },
    ],
    hideout: { x: 1600, y: 180 },
  },
];

export function missionReward(index) {
  return MISSION_REWARDS[index] || 0;
}

// Where the glowing "M" start marker for mission `index` sits.
export function missionStartPoint(index) {
  return MISSION_DEFS[index].start;
}

// Begin a mission: clear its targets, spawn what it needs, start its timer.
export function startMission(state, index) {
  const def = MISSION_DEFS[index];
  const m = state.mission;
  m.index = index;
  m.phase = 'active';
  m.timer = def.timeLimit;
  m.progress = 0;
  m.targets = [];
  m.stopIndex = 0;
  m.fare = null;
  m.message = def.intro;

  if (def.type === 'goto') {
    m.targets = [{ x: def.target.x, y: def.target.y, done: false }];
  } else if (def.type === 'collect') {
    for (let i = 0; i < def.count; i++) {
      const p = randomSidewalkPoint(state.world, state.rng);
      m.targets.push({ x: p.x, y: p.y, done: false, kind: 'package' });
    }
  } else if (def.type === 'loseWanted') {
    state.heat = 60;
    state.lastCrimeAt = state.time;
  } else if (def.type === 'destroy') {
    for (let i = 0; i < def.count; i++) {
      const car = state.spawnTargetCar();
      m.targets.push({ car, done: false, kind: 'wreck' });
    }
  } else if (def.type === 'taxi') {
    spawnFare(state);
  } else if (def.type === 'stops') {
    m.targets = def.stops.map((s) => ({ x: s.x, y: s.y, done: false, kind: 'stop' }));
  }
}

// Spawn the next taxi fare: a waiting pedestrian with a pickup point.
function spawnFare(state) {
  const p = randomSidewalkPoint(state.world, state.rng);
  const destNode = state.world.nodes[state.rng.int(0, state.world.nodes.length - 1)];
  const fare = {
    x: p.x, y: p.y, destX: destNode.x, destY: destNode.y,
    state: 'waiting', // waiting -> riding -> done
  };
  // The fare is a real pedestrian standing at the pickup point.
  const ped = {
    x: p.x, y: p.y, tx: p.x, ty: p.y, speed: 0,
    color: '#ffd24e', hp: 30, fleeing: false, fleeUntil: 0, stay: true, fare: true,
  };
  state.peds.push(ped);
  fare.ped = ped;
  state.mission.fare = fare;
  state.mission.targets = [{ x: p.x, y: p.y, done: false, kind: 'fare' }];
}

// Advance the active mission one tick. Returns 'complete', 'failed' or null.
export function updateMission(state, dt) {
  const m = state.mission;
  if (m.phase !== 'active') return null;
  const def = MISSION_DEFS[m.index];
  m.timer -= dt;
  if (m.timer <= 0) {
    m.phase = 'failed';
    m.message = 'Out of time — ' + def.name + ' failed. Find the M marker to retry.';
    return 'failed';
  }

  const px = state.player.x;
  const py = state.player.y;

  if (def.type === 'goto') {
    const t = m.targets[0];
    if (dist(px, py, t.x, t.y) < 80) return completeMission(state);
  } else if (def.type === 'collect') {
    for (const t of m.targets) {
      if (!t.done && dist(px, py, t.x, t.y) < 55) {
        t.done = true;
        m.progress++;
        state.audio.pickup();
      }
    }
    if (m.progress >= def.count) return completeMission(state);
  } else if (def.type === 'loseWanted') {
    if (state.heat <= 0) return completeMission(state);
  } else if (def.type === 'destroy') {
    for (const t of m.targets) {
      if (!t.done && (!t.car || t.car.hp <= 0)) {
        t.done = true;
        m.progress++;
        state.audio.crash();
      }
    }
    if (m.progress >= def.count) return completeMission(state);
  } else if (def.type === 'taxi') {
    const fare = m.fare;
    if (fare.state === 'waiting') {
      if (dist(px, py, fare.x, fare.y) < 60 && state.player.car) {
        fare.state = 'riding';
        // The fare climbs in: remove their standing pedestrian.
        if (fare.ped) state.peds = state.peds.filter((p) => p !== fare.ped);
        m.targets = [{ x: fare.destX, y: fare.destY, done: false, kind: 'dropoff' }];
        m.message = 'Fare picked up — take them to the marker.';
      }
    } else if (fare.state === 'riding') {
      if (dist(px, py, fare.destX, fare.destY) < 70 && state.player.car) {
        fare.state = 'done';
        m.progress++;
        state.audio.pickup();
        if (m.progress >= def.count) return completeMission(state);
        spawnFare(state);
        m.message = 'Fare dropped off. Next pickup marked.';
      }
    }
  } else if (def.type === 'stops') {
    const t = m.targets[m.stopIndex];
    if (t && dist(px, py, t.x, t.y) < 80) {
      t.done = true;
      m.stopIndex++;
      state.audio.pickup();
      if (m.stopIndex >= m.targets.length) {
        m.targets = [{ x: def.hideout.x, y: def.hideout.y, done: false, kind: 'hideout' }];
        m.message = 'All stops hit — get to the hideout!';
      }
    } else if (m.stopIndex >= m.targets.length) {
      const h = m.targets[0];
      if (dist(px, py, h.x, h.y) < 80) return completeMission(state);
    }
  }
  return null;
}

function completeMission(state) {
  const m = state.mission;
  const reward = missionReward(m.index);
  state.money += reward;
  m.phase = 'done';
  m.message = MISSION_DEFS[m.index].name + ' complete! +$' + reward;
  state.audio.missionDone();
  state.banner = { text: m.message, until: state.time + 3 };
  return 'complete';
}

// The current objective marker on the map, or null.
export function currentMarker(state) {
  const m = state.mission;
  if (m.phase === 'active') {
    const def = MISSION_DEFS[m.index];
    if (def.type === 'goto') return m.targets[0];
    if (def.type === 'collect') return m.targets.find((t) => !t.done) || null;
    if (def.type === 'destroy') {
      const t = m.targets.find((t) => !t.done);
      return t && t.car ? { x: t.car.x, y: t.car.y } : null;
    }
    if (def.type === 'taxi' || def.type === 'stops') return m.targets[0] || null;
    if (def.type === 'loseWanted') return null;
  }
  if (m.phase === 'idle' && m.index < MISSION_DEFS.length) {
    return { x: missionStartPoint(m.index).x, y: missionStartPoint(m.index).y, kind: 'start' };
  }
  return null;
}

// One line for the HUD objective bar.
export function objectiveText(state) {
  const m = state.mission;
  if (m.phase === 'active') {
    const def = MISSION_DEFS[m.index];
    let extra = '';
    if (def.type === 'collect' || def.type === 'destroy' || def.type === 'taxi') {
      extra = ' (' + m.progress + '/' + def.count + ')';
    }
    if (def.type === 'stops') {
      extra = ' (' + m.stopIndex + '/' + def.stops.length + ' stops)';
    }
    return def.name + ': ' + def.intro.split('.')[0] + extra + ' — ' + Math.ceil(m.timer) + 's';
  }
  if (m.phase === 'done' && m.index + 1 < MISSION_DEFS.length) {
    return 'Mission complete! Find the M marker for: ' + MISSION_DEFS[m.index + 1].name;
  }
  if (m.index + 1 >= MISSION_DEFS.length && m.phase === 'done') {
    return 'All missions complete — Aurora Bay is yours. Free roam!';
  }
  if (m.phase === 'failed') {
    return MISSION_DEFS[m.index].name + ' failed. Find the M marker to retry.';
  }
  return 'Find the M marker to start: ' + MISSION_DEFS[m.index].name;
}
