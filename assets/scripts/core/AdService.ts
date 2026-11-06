export type RewardedAdPlacement = 'add_time' | 'clear_tray' | 'double_reward';

export interface RewardedAdResult {
  completed: boolean;
  placement: RewardedAdPlacement;
}

declare const wx:
  | {
      createRewardedVideoAd?: (options: { adUnitId: string }) => {
        load: () => Promise<void>;
        show: () => Promise<void>;
        onClose: (callback: (result?: { isEnded?: boolean }) => void) => void;
        onError: (callback: (error: unknown) => void) => void;
      };
    }
  | undefined;

export class AdService {
  private readonly mockDelayMs = 1000;

  constructor(private readonly adUnitId = '') {}

  showRewardedAd(placement: RewardedAdPlacement): Promise<RewardedAdResult> {
    if (this.canUseWechatRewardedAd()) {
      return this.showWechatRewardedAd(placement);
    }

    return this.showMockRewardedAd(placement);
  }

  private canUseWechatRewardedAd(): boolean {
    return typeof wx !== 'undefined' && typeof wx.createRewardedVideoAd === 'function' && this.adUnitId.length > 0;
  }

  private showMockRewardedAd(placement: RewardedAdPlacement): Promise<RewardedAdResult> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ completed: true, placement });
      }, this.mockDelayMs);
    });
  }

  private showWechatRewardedAd(placement: RewardedAdPlacement): Promise<RewardedAdResult> {
    return new Promise((resolve) => {
      const ad = wx.createRewardedVideoAd?.({ adUnitId: this.adUnitId });
      if (!ad) {
        resolve({ completed: false, placement });
        return;
      }

      ad.onClose((result) => {
        resolve({ completed: Boolean(result?.isEnded), placement });
      });

      ad.onError(() => {
        resolve({ completed: false, placement });
      });

      ad.load()
        .then(() => ad.show())
        .catch(() => {
          resolve({ completed: false, placement });
        });
    });
  }
}

