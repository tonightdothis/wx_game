import type { DrinkType } from './types.js';

export interface DrinkMeta {
  type: DrinkType;
  label: string;
  emoji: string;
  color: string;
}

export const DRINKS: Record<DrinkType, DrinkMeta> = {
  milk_tea: { type: 'milk_tea', label: '奶茶', emoji: '🧋', color: '#C48A5A' },
  coffee: { type: 'coffee', label: '咖啡', emoji: '☕', color: '#5D4037' },
  latte: { type: 'latte', label: '拿铁', emoji: '🥛', color: '#D7CCC8' },
  juice: { type: 'juice', label: '果汁', emoji: '🧃', color: '#FF9800' },
  smoothie: { type: 'smoothie', label: '昔昔', emoji: '🥤', color: '#E91E63' },
  soda: { type: 'soda', label: '汽水', emoji: '🍾', color: '#29B6F6' },
  matcha: { type: 'matcha', label: '抹茶', emoji: '🍵', color: '#66BB6A' },
  cocoa: { type: 'cocoa', label: '可可', emoji: '🍫', color: '#8D6E63' },
};

export const ALL_DRINK_TYPES: DrinkType[] = Object.keys(DRINKS) as DrinkType[];

export function isDrinkType(v: string): v is DrinkType {
  return v in DRINKS;
}
