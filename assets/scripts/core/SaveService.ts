import { sys } from 'cc';

export interface PlayerSaveData {
  coins: number;
  hintCount: number;
  shuffleCount: number;
  highestUnlockedLevel: number;
}

const SAVE_KEY = 'drink_match_save_v1';

export class SaveService {
  load(): PlayerSaveData {
    const raw = sys.localStorage.getItem(SAVE_KEY);
    if (!raw) {
      return this.createDefaultSave();
    }

    try {
      const parsed = JSON.parse(raw) as Partial<PlayerSaveData>;
      return {
        coins: Number.isFinite(parsed.coins) ? Number(parsed.coins) : 0,
        hintCount: Number.isFinite(parsed.hintCount) ? Number(parsed.hintCount) : 5,
        shuffleCount: Number.isFinite(parsed.shuffleCount) ? Number(parsed.shuffleCount) : 3,
        highestUnlockedLevel: Number.isFinite(parsed.highestUnlockedLevel)
          ? Math.max(1, Number(parsed.highestUnlockedLevel))
          : 1
      };
    } catch {
      return this.createDefaultSave();
    }
  }

  save(data: PlayerSaveData): void {
    sys.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  }

  clear(): void {
    sys.localStorage.removeItem(SAVE_KEY);
  }

  private createDefaultSave(): PlayerSaveData {
    return {
      coins: 0,
      hintCount: 5,
      shuffleCount: 3,
      highestUnlockedLevel: 1
    };
  }
}

