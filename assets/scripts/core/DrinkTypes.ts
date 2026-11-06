export type DrinkType =
  | 'milk_tea'
  | 'coffee'
  | 'lemon_tea'
  | 'strawberry_smoothie'
  | 'matcha_latte'
  | 'mango_slush'
  | 'watermelon_juice'
  | 'cocoa_latte'
  | 'blueberry_soda'
  | 'coconut_latte';

export interface DrinkDefinition {
  id: DrinkType;
  name: string;
  color: string;
}

export const DRINK_DEFINITIONS: Record<DrinkType, DrinkDefinition> = {
  milk_tea: { id: 'milk_tea', name: '珍珠奶茶', color: '#C98F62' },
  coffee: { id: 'coffee', name: '冰美式', color: '#6B4636' },
  lemon_tea: { id: 'lemon_tea', name: '柠檬茶', color: '#F5C84B' },
  strawberry_smoothie: { id: 'strawberry_smoothie', name: '草莓奶昔', color: '#F0728F' },
  matcha_latte: { id: 'matcha_latte', name: '抹茶拿铁', color: '#77A95E' },
  mango_slush: { id: 'mango_slush', name: '芒果冰沙', color: '#F59A30' },
  watermelon_juice: { id: 'watermelon_juice', name: '西瓜汁', color: '#E84D5B' },
  cocoa_latte: { id: 'cocoa_latte', name: '可可奶盖', color: '#8B5A46' },
  blueberry_soda: { id: 'blueberry_soda', name: '蓝莓气泡水', color: '#5D78D6' },
  coconut_latte: { id: 'coconut_latte', name: '椰椰拿铁', color: '#EFE4C7' }
};

