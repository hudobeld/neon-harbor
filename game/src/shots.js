// Staged scenes for the screenshots. The page reads ?shot=start|drive|chase|mission
// (and &seed=) and this module poses the game before the first frame, so each
// screenshot shows a real render of the game at its best.

import { startMission } from './missions.js';

export function applyShot(state, shot) {
  const world = state.world;
  if (shot === 'start') {
    state.mode = 'title';
    return;
  }
  state.mode = 'playing';

  if (shot === 'drive') {
    // Jax in a yellow car, mid-city, traffic around him.
    const car = state.playerCar();
    car.x = 900;
    car.y = 480;
    car.angle = 0;
    car.speed = 190;
    state.player.x = car.x;
    state.player.y = car.y;
    state.player.car = car;
    state.camera.x = car.x - 640;
    state.camera.y = car.y - 400;
  } else if (shot === 'chase') {
    // Three-star wanted: two police cars closing in on Jax's car.
    const car = state.playerCar();
    car.x = 1250;
    car.y = 780;
    car.angle = Math.PI;
    car.speed = 220;
    car.hp = 300; // staged scene: the chase car holds up for the screenshot
    state.player.x = car.x;
    state.player.y = car.y;
    state.player.car = car;
    state.heat = 55;
    state.spawnPoliceCar(1250 - 430, 780);
    state.spawnPoliceCar(1250 + 480, 780);
    state.spawnCop(1250 - 200, 780 - 60);
    state.camera.x = car.x - 640;
    state.camera.y = car.y - 400;
  } else if (shot === 'mission') {
    // Mission 1 in progress: marker ahead, Jax driving toward it.
    const car = state.playerCar();
    car.x = 1600;
    car.y = 1080;
    car.angle = -Math.PI / 2;
    car.speed = 150;
    state.player.x = car.x;
    state.player.y = car.y;
    state.player.car = car;
    startMission(state, 0);
    state.camera.x = car.x - 640;
    state.camera.y = car.y - 400;
  }
  state.camera.x = Math.max(0, Math.min(state.camera.x, 2400 - 1280));
  state.camera.y = Math.max(0, Math.min(state.camera.y, 1800 - 800));
}
