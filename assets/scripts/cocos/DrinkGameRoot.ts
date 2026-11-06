import {
  _decorator,
  Camera,
  Canvas,
  Color,
  Component,
  Graphics,
  JsonAsset,
  Label,
  Layers,
  Node,
  resources,
  sys,
  UITransform,
  view,
  Vec3
} from 'cc';
import { DrinkGameEngine } from '../core/DrinkGameEngine';
import type { BoardItem } from '../core/DrinkGameEngine';
import { AdService } from '../core/AdService';
import type { RewardedAdPlacement } from '../core/AdService';
import { SaveService } from '../core/SaveService';
import { DRINK_DEFINITIONS } from '../core/DrinkTypes';
import type { DrinkType } from '../core/DrinkTypes';
import type { LevelConfig } from '../core/LevelConfig';

const { ccclass, property } = _decorator;

@ccclass('DrinkGameRoot')
export class DrinkGameRoot extends Component {
  @property
  levelPath = 'levels/level_001';

  @property
  rewardedAdUnitId = '';

  private engine: DrinkGameEngine | null = null;
  private adService: AdService | null = null;
  private saveService: SaveService | null = null;
  private canvasNode: Node | null = null;
  private contentRoot: Node | null = null;
  private boardLayer: Node | null = null;
  private trayLayer: Node | null = null;
  private hudLayer: Node | null = null;
  private overlayLayer: Node | null = null;
  private resultPanel: Node | null = null;
  private modalPanel: Node | null = null;
  private timeLabel: Label | null = null;
  private statusLabel: Label | null = null;
  private comboLabel: Label | null = null;
  private inventoryLabel: Label | null = null;
  private currentLevel = 1;
  private lastStatus: string | null = null;
  private highlightedItemIds = new Set<string>();
  private coins = 0;
  private hintCount = 5;
  private shuffleCount = 3;
  private highestUnlockedLevel = 1;
  private lastWinReward = 0;
  private rewardDoubledForLevel = false;
  private contentScale = 1;
  private topSafeOffset = 0;
  private bottomSafeOffset = 0;

  private readonly tileSize = 72;
  private readonly tileGap = 10;
  private readonly traySize = 64;
  private readonly maxPrototypeLevel = 5;

  onLoad(): void {
    console.log('[DrinkGameRoot] prototype started');
    this.adService = new AdService(this.rewardedAdUnitId);
    this.saveService = new SaveService();
    this.loadPlayerSave();
    this.ensureRootSize();
    this.ensureCamera();
    this.safeUpdateLayoutMetrics();
    this.createStaticLayout();
    this.currentLevel = this.readLevelNumber(this.levelPath);
    this.loadLevel(this.currentLevel);
  }

  update(deltaTime: number): void {
    if (!this.engine) {
      return;
    }

    this.engine.tick(deltaTime);
    this.refreshHud();
    this.refreshResultPanel();
  }

  private loadLevel(levelNumber: number): void {
    const path = this.getLevelPath(levelNumber);
    resources.load(path, JsonAsset, (error, asset) => {
      if (error || !asset) {
        this.setStatus(`关卡加载失败: ${path}`);
        return;
      }

      this.engine = new DrinkGameEngine(asset.json as LevelConfig);
      this.engine.start();
      this.currentLevel = levelNumber;
      this.lastStatus = null;
      this.lastWinReward = 0;
      this.rewardDoubledForLevel = false;
      this.highlightedItemIds.clear();
      this.highestUnlockedLevel = Math.min(this.maxPrototypeLevel, Math.max(this.highestUnlockedLevel, levelNumber));
      this.hideResultPanel();
      this.renderBoard();
      this.renderTray();
      this.refreshHud();
      this.savePlayerProgress();
    });
  }

  private createStaticLayout(): void {
    this.node.removeAllChildren();
    this.canvasNode = this.createCanvasNode();
    this.contentRoot = this.createContentRoot();

    const background = this.createRectNode('Background', 720, 1280, new Color(35, 42, 55, 255), new Color(35, 42, 55, 255));
    background.setPosition(0, 0, -1);
    this.contentRoot?.addChild(background);

    this.hudLayer = this.createLayer('HUD', new Vec3(0, 0, 0));
    this.boardLayer = this.createLayer('Board', new Vec3(0, -10, 0));
    this.trayLayer = this.createLayer('Tray', new Vec3(0, -252, 0));
    this.overlayLayer = this.createLayer('Overlay', new Vec3(0, 0, 0));

    const topY = 494 - this.topSafeOffset;
    const bottomButtonY = -468 + this.bottomSafeOffset * 0.35;
    this.timeLabel = this.createLabel(this.hudLayer, 'TimeLabel', '时间 0', 28, new Vec3(-132, topY, 0));
    this.statusLabel = this.createLabel(this.hudLayer, 'StatusLabel', '加载中', 24, new Vec3(0, topY - 44, 0));
    this.comboLabel = this.createLabel(this.hudLayer, 'ComboLabel', 'Combo 0', 20, new Vec3(218, topY - 2, 0));
    this.inventoryLabel = this.createLabel(this.hudLayer, 'InventoryLabel', '', 17, new Vec3(0, topY - 78, 0));

    this.createButton(this.hudLayer, 'HintButton', '提示', new Vec3(-156, bottomButtonY, 0), () => this.useHint());
    this.createButton(this.hudLayer, 'ShuffleButton', '洗牌', new Vec3(0, bottomButtonY, 0), () => this.useShuffle());
    this.createButton(this.hudLayer, 'ClearTrayButton', '广告清盘', new Vec3(156, bottomButtonY, 0), () => this.watchAdForClearTray());
    this.createButton(this.hudLayer, 'LevelButton', '选关', new Vec3(-156, topY + 48, 0), () => this.showLevelSelectPanel());
    this.createButton(this.hudLayer, 'ShopButton', '商店', new Vec3(156, topY + 48, 0), () => this.showShopPanel());
    this.refreshInventory();
  }

  private renderBoard(): void {
    if (!this.engine || !this.boardLayer) {
      return;
    }

    this.boardLayer.removeAllChildren();
    const maxBoardWidth = 580;
    const fittedTileSize = Math.min(
      this.tileSize,
      (maxBoardWidth - (this.engine.width - 1) * this.tileGap) / this.engine.width
    );
    const activeItems = this.engine.items.filter((item) => !item.removed);
    const minX = Math.min(...activeItems.map((item) => item.x), 0);
    const maxX = Math.max(...activeItems.map((item) => item.x), 0);
    const maxY = Math.max(...activeItems.map((item) => item.y), 0);
    const usedColumns = Math.max(1, maxX - minX + 1);
    const usedRows = Math.max(1, maxY + 1);
    const boardWidth = usedColumns * fittedTileSize + (usedColumns - 1) * this.tileGap;
    const boardHeight = usedRows * fittedTileSize + (usedRows - 1) * this.tileGap;
    const startX = -boardWidth / 2 + fittedTileSize / 2;
    const startY = boardHeight / 2 - fittedTileSize / 2;

    for (const item of activeItems) {
      const x = startX + (item.x - minX) * (fittedTileSize + this.tileGap);
      const y = startY - item.y * (fittedTileSize + this.tileGap) + item.layer * 8;
      const node = this.createDrinkNode(item, fittedTileSize);
      node.setPosition(x, y, 0);
      this.boardLayer.addChild(node);
    }
  }

  private renderTray(): void {
    if (!this.engine || !this.trayLayer) {
      return;
    }

    this.trayLayer.removeAllChildren();
    const totalWidth = this.engine.traySize * this.traySize + (this.engine.traySize - 1) * this.tileGap;
    const startX = -totalWidth / 2 + this.traySize / 2;

    for (let index = 0; index < this.engine.traySize; index += 1) {
      const slot = this.engine.tray[index];
      const slotNode = this.createRectNode(
        `TraySlot_${index}`,
        this.traySize,
        this.traySize,
        slot ? new Color(248, 250, 252, 255) : new Color(228, 231, 235, 255),
        new Color(103, 117, 132, 255)
      );
      slotNode.setPosition(startX + index * (this.traySize + this.tileGap), 0, 0);

      if (slot) {
        this.drawCup(slotNode, slot.type, this.traySize * 0.76, this.traySize * 0.82, false);
      }

      this.trayLayer.addChild(slotNode);
    }
  }

  private createDrinkNode(item: BoardItem, size: number): Node {
    const color = item.blocker ? new Color(148, 163, 184, 255) : new Color(248, 250, 252, 255);
    const isHighlighted = this.highlightedItemIds.has(item.id);
    const border = isHighlighted
      ? new Color(255, 220, 80, 255)
      : this.engine?.canSelect(item.id)
      ? new Color(255, 255, 255, 255)
      : new Color(94, 104, 120, 255);
    const node = this.createRectNode(`Drink_${item.id}`, size, size, color, border);

    const drink = DRINK_DEFINITIONS[item.type];
    const labelText = item.blocker === 'mystery' ? '?' : drink.name.slice(0, 2);
    if (item.blocker === 'mystery') {
      this.createLabel(node, `DrinkLabel_${item.id}`, labelText, 26, new Vec3(0, 0, 0));
    } else {
      this.drawCup(node, item.type, size * 0.72, size * 0.82, Boolean(item.blocker));
      this.createLabel(node, `DrinkLabel_${item.id}`, labelText, 13, new Vec3(0, -size * 0.34, 0));
    }

    if (item.blocker) {
      this.createLabel(node, `BlockerLabel_${item.id}`, this.getBlockerText(item.blocker), 12, new Vec3(0, 22, 0));
    }

    if (isHighlighted) {
      const hintFrame = this.createStrokeRectNode(
        `HintFrame_${item.id}`,
        size + 10,
        size + 10,
        new Color(255, 220, 80, 255)
      );
      hintFrame.setPosition(0, 0, -1);
      node.addChild(hintFrame);
      this.createLabel(node, `HintLabel_${item.id}`, '!', 20, new Vec3(size * 0.32, size * 0.3, 0));
    }

    node.on(Node.EventType.TOUCH_END, () => this.selectDrink(item.id));
    return node;
  }

  private selectDrink(itemId: string): void {
    if (!this.engine) {
      return;
    }

    this.highlightedItemIds.clear();
    const result = this.engine.selectItem(itemId);
    if (!result.accepted) {
      this.setStatus('这杯现在不能点');
      return;
    }

    if (result.matchedType) {
      const drink = DRINK_DEFINITIONS[result.matchedType];
      const comboText = this.engine.combo > 1 ? ` Combo ${this.engine.combo}` : '';
      this.setStatus(`${drink.name} 出杯 +1秒${comboText}`);
      this.flashStatus(new Color(255, 238, 166, 255));
    }

    this.renderBoard();
    this.renderTray();
    this.refreshHud();
  }

  private useHint(): void {
    if (!this.engine) {
      return;
    }

    if (this.hintCount <= 0) {
      this.setStatus('提示道具不足');
      this.flashStatus(new Color(255, 180, 180, 255));
      return;
    }

    const hint = this.engine.useHint();
    if (hint.reason === 'none') {
      this.setStatus('暂无可提示饮品');
      return;
    }

    this.hintCount -= 1;
    this.savePlayerProgress();
    this.highlightedItemIds = new Set(hint.itemIds);

    if (hint.reason === 'complete_tray_match') {
      this.setStatus('提示：点高亮饮品可凑成一组');
    } else if (hint.reason === 'available_group') {
      this.setStatus('提示：点亮的 3 杯是一组');
    } else {
      this.setStatus('提示：先点这杯打开局面');
    }

    this.flashStatus(new Color(255, 238, 166, 255));
    this.renderBoard();
    this.refreshInventory();
  }

  private useShuffle(): void {
    if (!this.engine) {
      return;
    }

    if (this.shuffleCount <= 0) {
      this.setStatus('洗牌道具不足');
      this.flashStatus(new Color(255, 180, 180, 255));
      return;
    }

    this.shuffleCount -= 1;
    this.savePlayerProgress();
    this.engine.shuffle();
    this.highlightedItemIds.clear();
    this.setStatus('已洗牌');
    this.renderBoard();
    this.refreshInventory();
  }

  private useAddTime(): void {
    if (!this.engine) {
      return;
    }

    this.engine.addTime(30);
    this.lastStatus = null;
    this.hideResultPanel();
    this.setStatus('已加时 30 秒');
    this.refreshHud();
  }

  private useClearTray(): void {
    if (!this.engine) {
      return;
    }

    this.engine.clearTraySlots(3);
    this.lastStatus = null;
    this.hideResultPanel();
    this.setStatus('已清理托盘');
    this.renderTray();
    this.refreshHud();
  }

  private watchAdForAddTime(): void {
    this.watchRewardedAd('add_time', () => this.useAddTime());
  }

  private watchAdForClearTray(): void {
    this.watchRewardedAd('clear_tray', () => this.useClearTray());
  }

  private watchAdForDoubleReward(): void {
    this.watchRewardedAd('double_reward', () => this.doubleWinReward());
  }

  private watchRewardedAd(placement: RewardedAdPlacement, reward: () => void): void {
    if (!this.adService) {
      this.showAdUnavailable();
      return;
    }

    this.hideResultPanel();
    this.setStatus('广告播放中...');
    this.flashStatus(new Color(255, 238, 166, 255));

    this.adService.showRewardedAd(placement).then((result) => {
      if (!result.completed) {
        this.showAdUnavailable();
        return;
      }

      reward();
    });
  }

  private showAdUnavailable(): void {
    this.setStatus('广告暂不可用，请稍后再试');
    this.flashStatus(new Color(255, 180, 180, 255));
  }

  private calculateWinReward(): number {
    if (!this.engine) {
      return 0;
    }

    const baseReward = 50;
    const levelBonus = this.currentLevel * 10;
    const timeBonus = Math.ceil(this.engine.remainingTime / 5);
    return baseReward + levelBonus + timeBonus;
  }

  private doubleWinReward(): void {
    if (this.lastWinReward <= 0 || this.rewardDoubledForLevel) {
      return;
    }

    this.coins += this.lastWinReward;
    this.rewardDoubledForLevel = true;
    this.refreshInventory();
    this.savePlayerProgress();
    this.setStatus(`广告翻倍成功，金币 +${this.lastWinReward}`);
    this.flashStatus(new Color(255, 238, 166, 255));
    this.showResultPanel('通关', `金币已翻倍，额外 +${this.lastWinReward}`, '下一关', () => this.nextLevel());
  }

  private refreshHud(): void {
    if (!this.engine) {
      return;
    }

    if (this.timeLabel) {
      this.timeLabel.string = `${this.currentLevel}关 ${Math.ceil(this.engine.remainingTime)}s`;
      this.timeLabel.color = this.engine.remainingTime <= 10 ? new Color(220, 38, 38, 255) : Color.WHITE;
    }

    if (this.comboLabel) {
      this.comboLabel.string = `Combo ${this.engine.combo}`;
      this.comboLabel.color = this.engine.combo > 1 ? new Color(255, 220, 80, 255) : Color.WHITE;
    }

    this.refreshInventory();

    if (this.engine.status === 'won') {
      this.setStatus('通关');
    } else if (this.engine.status === 'failed') {
      this.setStatus(this.engine.failReason === 'time_up' ? '时间到，点 +30秒 继续' : '托盘满，点清托盘继续');
    } else if (this.statusLabel?.string === '加载中') {
      this.setStatus(`第 ${this.currentLevel} 关 找到 3 杯相同饮品`);
    }
  }

  private refreshResultPanel(): void {
    if (!this.engine || this.engine.status === this.lastStatus) {
      return;
    }

    this.lastStatus = this.engine.status;

    if (this.engine.status === 'won') {
      if (this.lastWinReward <= 0) {
        this.lastWinReward = this.calculateWinReward();
        this.coins += this.lastWinReward;
        this.highestUnlockedLevel = Math.min(
          this.maxPrototypeLevel,
          Math.max(this.highestUnlockedLevel, this.currentLevel + 1)
        );
        this.refreshInventory();
        this.savePlayerProgress();
      }

      this.showResultPanel(
        '通关',
        `第 ${this.currentLevel} 关完成，金币 +${this.lastWinReward}`,
        '下一关',
        () => this.nextLevel(),
        true
      );
    } else if (this.engine.status === 'failed') {
      const reason = this.engine.failReason === 'time_up' ? '时间用完了' : '托盘已经满了';
      this.showResultPanel('挑战失败', reason, '重玩', () => this.restartLevel());
    } else {
      this.hideResultPanel();
    }
  }

  private showResultPanel(
    title: string,
    message: string,
    primaryText: string,
    primaryAction: () => void,
    canDoubleReward = false
  ): void {
    if (!this.overlayLayer) {
      return;
    }

    this.hideResultPanel();

    const panel = this.createRectNode('ResultPanel', 420, 280, new Color(24, 32, 44, 245), new Color(255, 255, 255, 255));
    panel.setPosition(0, 20, 0);

    this.createLabel(panel, 'ResultTitle', title, 34, new Vec3(0, 80, 0));
    this.createLabel(panel, 'ResultMessage', message, 22, new Vec3(0, 32, 0));
    this.createButton(panel, 'ResultPrimaryButton', primaryText, new Vec3(0, -58, 0), primaryAction);

    if (canDoubleReward && !this.rewardDoubledForLevel) {
      this.createButton(panel, 'ResultDoubleRewardButton', '广告翻倍', new Vec3(0, -118, 0), () => {
        this.hideResultPanel();
        this.watchAdForDoubleReward();
      });
    } else if (this.engine?.status === 'failed') {
      this.createButton(panel, 'ResultAddTimeButton', '看广告继续', new Vec3(0, -118, 0), () => {
        this.hideResultPanel();
        if (this.engine?.failReason === 'tray_full') {
          this.watchAdForClearTray();
        } else {
          this.watchAdForAddTime();
        }
      });
    }

    this.overlayLayer.addChild(panel);
    this.resultPanel = panel;
  }

  private hideResultPanel(): void {
    if (this.resultPanel && this.resultPanel.isValid) {
      this.resultPanel.destroy();
    }
    this.resultPanel = null;
  }

  private showLevelSelectPanel(): void {
    if (!this.overlayLayer) {
      return;
    }

    this.hideResultPanel();
    this.hideModalPanel();

    const panel = this.createRectNode('LevelSelectPanel', 500, 390, new Color(24, 32, 44, 248), new Color(255, 255, 255, 255));
    panel.setPosition(0, 28, 0);
    this.createLabel(panel, 'LevelSelectTitle', '选择关卡', 32, new Vec3(0, 145, 0));
    this.createLabel(panel, 'LevelSelectMessage', `已解锁到第 ${this.highestUnlockedLevel} 关`, 20, new Vec3(0, 108, 0));

    for (let index = 1; index <= this.maxPrototypeLevel; index += 1) {
      const unlocked = index <= this.highestUnlockedLevel;
      const x = -160 + ((index - 1) % 3) * 160;
      const y = 34 - Math.floor((index - 1) / 3) * 82;
      const label = unlocked ? `第${index}关` : `第${index}关 锁`;
      this.createButton(panel, `LevelButton_${index}`, label, new Vec3(x, y, 0), () => {
        if (!unlocked) {
          this.setStatus('关卡尚未解锁');
          this.flashStatus(new Color(255, 180, 180, 255));
          return;
        }

        this.hideModalPanel();
        this.loadLevel(index);
      }, unlocked ? undefined : new Color(80, 88, 102, 255));
    }

    this.createButton(panel, 'LevelCloseButton', '关闭', new Vec3(0, -150, 0), () => this.hideModalPanel());
    this.overlayLayer.addChild(panel);
    this.modalPanel = panel;
  }

  private showShopPanel(): void {
    if (!this.overlayLayer) {
      return;
    }

    this.hideResultPanel();
    this.hideModalPanel();

    const panel = this.createRectNode('ShopPanel', 480, 360, new Color(24, 32, 44, 248), new Color(255, 255, 255, 255));
    panel.setPosition(0, 28, 0);
    this.createLabel(panel, 'ShopTitle', '道具商店', 32, new Vec3(0, 126, 0));
    this.createLabel(panel, 'ShopCoins', `当前金币 ${this.coins}`, 20, new Vec3(0, 88, 0));

    this.createButton(panel, 'BuyHintButton', '买提示 100', new Vec3(0, 24, 0), () => this.buyHint());
    this.createButton(panel, 'BuyShuffleButton', '买洗牌 150', new Vec3(0, -46, 0), () => this.buyShuffle());
    this.createButton(panel, 'ShopCloseButton', '关闭', new Vec3(0, -126, 0), () => this.hideModalPanel());

    this.overlayLayer.addChild(panel);
    this.modalPanel = panel;
  }

  private hideModalPanel(): void {
    if (this.modalPanel && this.modalPanel.isValid) {
      this.modalPanel.destroy();
    }
    this.modalPanel = null;
  }

  private buyHint(): void {
    this.buyItem(100, () => {
      this.hintCount += 1;
      this.setStatus('购买成功：提示 +1');
    });
  }

  private buyShuffle(): void {
    this.buyItem(150, () => {
      this.shuffleCount += 1;
      this.setStatus('购买成功：洗牌 +1');
    });
  }

  private buyItem(cost: number, grant: () => void): void {
    if (this.coins < cost) {
      this.setStatus('金币不足');
      this.flashStatus(new Color(255, 180, 180, 255));
      return;
    }

    this.coins -= cost;
    grant();
    this.flashStatus(new Color(255, 238, 166, 255));
    this.refreshInventory();
    this.savePlayerProgress();
    this.showShopPanel();
  }

  private nextLevel(): void {
    const next = this.currentLevel >= this.maxPrototypeLevel ? 1 : this.currentLevel + 1;
    this.loadLevel(next);
  }

  private restartLevel(): void {
    this.loadLevel(this.currentLevel);
  }

  private getLevelPath(levelNumber: number): string {
    return `levels/level_${levelNumber.toString().padStart(3, '0')}`;
  }

  private readLevelNumber(path: string): number {
    const match = path.match(/level_(\d+)/);
    if (!match) {
      return 1;
    }

    return Number.parseInt(match[1], 10);
  }

  private setStatus(text: string): void {
    if (this.statusLabel) {
      this.statusLabel.string = text;
    }
  }

  private refreshInventory(): void {
    if (!this.inventoryLabel) {
      return;
    }

    this.inventoryLabel.string = `金币${this.coins}  提示${this.hintCount}  洗牌${this.shuffleCount}  关卡${this.highestUnlockedLevel}`;
  }

  private loadPlayerSave(): void {
    if (!this.saveService) {
      return;
    }

    const save = this.saveService.load();
    this.coins = save.coins;
    this.hintCount = save.hintCount;
    this.shuffleCount = save.shuffleCount;
    this.highestUnlockedLevel = save.highestUnlockedLevel;
  }

  private savePlayerProgress(): void {
    if (!this.saveService) {
      return;
    }

    this.saveService.save({
      coins: this.coins,
      hintCount: this.hintCount,
      shuffleCount: this.shuffleCount,
      highestUnlockedLevel: this.highestUnlockedLevel
    });
  }

  private flashStatus(color: Color): void {
    if (!this.statusLabel) {
      return;
    }

    this.statusLabel.color = color;
    this.scheduleOnce(() => {
      if (this.statusLabel) {
        this.statusLabel.color = Color.WHITE;
      }
    }, 0.25);
  }

  private createLayer(name: string, position: Vec3): Node {
    const layer = new Node(name);
    layer.layer = Layers.Enum.UI_2D;
    layer.setPosition(position);
    const parent = this.contentRoot ?? this.canvasNode ?? this.node;
    parent.addChild(layer);
    return layer;
  }

  private createButton(
    parent: Node,
    name: string,
    text: string,
    position: Vec3,
    onClick: () => void,
    fill = new Color(33, 150, 130, 255)
  ): Node {
    const button = this.createRectNode(name, 132, 50, fill, new Color(255, 255, 255, 255));
    button.setPosition(position);
    this.createLabel(button, `${name}_Label`, text, 20, new Vec3(0, 0, 0));
    button.on(Node.EventType.TOUCH_END, onClick);
    parent.addChild(button);
    return button;
  }

  private createRectNode(name: string, width: number, height: number, fill: Color, stroke: Color): Node {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    const transform = node.addComponent(UITransform);
    transform.setContentSize(width, height);

    const graphics = node.addComponent(Graphics);
    graphics.lineWidth = 3;
    graphics.strokeColor = stroke;
    graphics.fillColor = fill;
    graphics.roundRect(-width / 2, -height / 2, width, height, 10);
    graphics.fill();
    graphics.stroke();

    return node;
  }

  private createStrokeRectNode(name: string, width: number, height: number, stroke: Color): Node {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    const transform = node.addComponent(UITransform);
    transform.setContentSize(width, height);

    const graphics = node.addComponent(Graphics);
    graphics.lineWidth = 5;
    graphics.strokeColor = stroke;
    graphics.roundRect(-width / 2, -height / 2, width, height, 12);
    graphics.stroke();
    return node;
  }

  private drawCup(parent: Node, type: DrinkType, width: number, height: number, disabled: boolean): void {
    const cup = new Node(`Cup_${type}`);
    cup.layer = Layers.Enum.UI_2D;
    parent.addChild(cup);

    const graphics = cup.addComponent(Graphics);
    const drinkColor = disabled ? new Color(145, 155, 170, 255) : this.getDrinkColor(type);
    const cupTop = height * 0.28;
    const cupBottom = -height * 0.28;
    const cupWidthTop = width * 0.7;
    const cupWidthBottom = width * 0.52;

    graphics.lineWidth = 2;
    graphics.strokeColor = new Color(255, 255, 255, 220);
    graphics.fillColor = drinkColor;
    graphics.moveTo(-cupWidthTop / 2, cupTop);
    graphics.lineTo(cupWidthTop / 2, cupTop);
    graphics.lineTo(cupWidthBottom / 2, cupBottom);
    graphics.lineTo(-cupWidthBottom / 2, cupBottom);
    graphics.close();
    graphics.fill();
    graphics.stroke();

    graphics.fillColor = new Color(255, 255, 255, 215);
    graphics.roundRect(-cupWidthTop / 2 - 4, cupTop - 4, cupWidthTop + 8, 8, 4);
    graphics.fill();

    graphics.strokeColor = new Color(255, 255, 255, 230);
    graphics.lineWidth = 3;
    graphics.moveTo(width * 0.1, cupTop + 4);
    graphics.lineTo(width * 0.28, cupTop + height * 0.24);
    graphics.stroke();

    graphics.fillColor = new Color(255, 255, 255, 70);
    graphics.roundRect(-cupWidthTop * 0.22, cupTop - height * 0.34, cupWidthTop * 0.18, height * 0.38, 6);
    graphics.fill();
  }

  private createLabel(parent: Node, name: string, text: string, fontSize: number, position: Vec3): Label {
    const labelNode = new Node(name);
    labelNode.layer = Layers.Enum.UI_2D;
    labelNode.setPosition(position);
    parent.addChild(labelNode);

    const label = labelNode.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = fontSize + 4;
    label.color = Color.WHITE;
    return label;
  }

  private getDrinkColor(type: DrinkType): Color {
    return this.hexToColor(DRINK_DEFINITIONS[type].color);
  }

  private hexToColor(hex: string): Color {
    const normalized = hex.replace('#', '');
    const value = Number.parseInt(normalized, 16);
    const red = (value >> 16) & 255;
    const green = (value >> 8) & 255;
    const blue = value & 255;
    return new Color(red, green, blue, 255);
  }

  private getBlockerText(blocker: NonNullable<BoardItem['blocker']>): string {
    if (blocker === 'ice') {
      return '冰';
    }
    if (blocker === 'bubble') {
      return '盖';
    }
    if (blocker === 'lock') {
      return '锁';
    }
    return '盲';
  }

  private ensureRootSize(): void {
    let transform = this.node.getComponent(UITransform);
    if (!transform) {
      transform = this.node.addComponent(UITransform);
    }

    this.node.layer = Layers.Enum.UI_2D;

    if (transform.contentSize.width === 0 || transform.contentSize.height === 0) {
      transform.setContentSize(720, 1280);
    }
  }

  private createCanvasNode(): Node {
    const canvasNode = new Node('RuntimeCanvas');
    canvasNode.layer = Layers.Enum.UI_2D;
    canvasNode.setPosition(0, 0, 0);
    this.node.addChild(canvasNode);

    const transform = canvasNode.addComponent(UITransform);
    transform.setContentSize(720, 1280);
    canvasNode.addComponent(Canvas);
    return canvasNode;
  }

  private createContentRoot(): Node {
    const contentRoot = new Node('ContentRoot');
    contentRoot.layer = Layers.Enum.UI_2D;
    contentRoot.setScale(this.contentScale, this.contentScale, 1);
    contentRoot.setPosition(0, this.resolveCanvasYOffset(), 0);
    this.canvasNode?.addChild(contentRoot);
    return contentRoot;
  }

  private safeUpdateLayoutMetrics(): void {
    try {
      this.updateLayoutMetrics();
    } catch (error) {
      console.warn('[DrinkGameRoot] layout fallback', error);
      this.contentScale = 1;
      this.topSafeOffset = 0;
      this.bottomSafeOffset = 0;
    }
  }

  private updateLayoutMetrics(): void {
    const visibleSize = view.getVisibleSize();
    const widthScale = visibleSize.width / 720;
    const heightScale = visibleSize.height / 1280;
    this.contentScale = Math.min(widthScale, heightScale, 1);

    if (!Number.isFinite(this.contentScale) || this.contentScale <= 0) {
      this.contentScale = 1;
    }

    const safeArea = view.getSafeAreaRect ? view.getSafeAreaRect() : {
      x: 0,
      y: 0,
      width: visibleSize.width,
      height: visibleSize.height
    };
    const topUnsafePixels = Math.max(0, visibleSize.height - safeArea.y - safeArea.height);
    const bottomUnsafePixels = Math.max(0, safeArea.y);

    this.topSafeOffset = Math.min(150, topUnsafePixels / this.contentScale + 96);
    this.bottomSafeOffset = Math.min(110, bottomUnsafePixels / this.contentScale + 48);

    if (!sys.isMobile) {
      this.topSafeOffset = 0;
      this.bottomSafeOffset = 0;
    }

    console.log(
      `[DrinkGameRoot] layout scale=${this.contentScale.toFixed(3)} top=${this.topSafeOffset.toFixed(1)} bottom=${this.bottomSafeOffset.toFixed(1)} window=${visibleSize.width}x${visibleSize.height}`
    );
  }

  private resolveCanvasYOffset(): number {
    return 0;
  }

  private ensureCamera(): void {
    const scene = this.node.scene;
    if (!scene) {
      return;
    }

    const cameraNode = scene.getChildByName('Main Camera');
    const camera = cameraNode?.getComponent(Camera);
    if (!camera || !cameraNode) {
      return;
    }

    cameraNode.setPosition(0, 0, 1000);
    cameraNode.setRotationFromEuler(0, 0, 0);
    camera.projection = Camera.ProjectionType.ORTHO;
    camera.orthoHeight = 640;
    camera.visibility = Layers.Enum.DEFAULT | Layers.Enum.UI_2D;
  }
}
