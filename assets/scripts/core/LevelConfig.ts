import type { DrinkType } from './DrinkTypes';

export interface LevelItemConfig {
  type: DrinkType;
  x: number;
  y: number;
  layer?: number;
  blocker?: 'ice' | 'bubble' | 'mystery' | 'lock';
}

export interface LevelGoalConfig {
  type: 'clear_all';
}

export interface LevelConfig {
  levelId: number;
  width: number;
  height: number;
  timeLimit: number;
  traySize: number;
  goal: LevelGoalConfig;
  items: LevelItemConfig[];
}

