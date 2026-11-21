// NEON HARBOR — shared constants for the open-world crime game.
// Original city "Aurora Bay", original characters and story. No third-party assets.

export const WORLD_W = 2400;
export const WORLD_H = 1800;
export const ROAD_W = 88;
export const VIEW_W = 1280;
export const VIEW_H = 800;

// Vertical avenue centre lines and horizontal street centre lines.
export const VERTICAL_ROADS = [200, 550, 900, 1250, 1600, 1950, 2300];
export const HORIZONTAL_ROADS = [180, 480, 780, 1080, 1380];

// The river runs along the south edge; only the two bridges cross it.
export const RIVER_TOP = 1560;
export const BRIDGE_X = [550, 1600];

export const PLAYER_R = 14;
export const PLAYER_WALK_SPEED = 170;
export const PLAYER_RUN_SPEED = 260;
export const CAR_W = 48;
export const CAR_H = 26;
export const PED_R = 10;

export const START_MONEY = 150;
export const RESPRAY_COST = 100;
export const BAIL_COST = 200;
export const AMMO_PICKUP = 24;
export const HEALTH_PICKUP = 50;

export const SAVE_KEY = 'neon-harbor-save-v1';

export const PALETTE = {
  grass: '#3f7a44',
  park: '#2f6b34',
  road: '#2b2e36',
  roadEdge: '#3a3e48',
  lane: '#d8c95a',
  sidewalk: '#565b66',
  water: '#1e5f8a',
  sand: '#c9b183',
  buildingRoof: ['#7a5a3c', '#5c6b7a', '#8a6f4d', '#4d5a6b', '#96684a', '#6b4d5a'],
  buildingEdge: '#22242a',
  carColors: ['#c23b2e', '#2e6fc2', '#e0a52e', '#3fae6a', '#8a4dc2', '#d8d8d8', '#2a2a2a', '#c26a2e'],
  policeColor: '#1c4fd6',
  playerColor: '#f2c14e',
};

export const MISSION_REWARDS = [300, 400, 600, 700, 800, 1500];
