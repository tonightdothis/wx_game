"use strict";
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/core/drinks.ts
var DRINKS = {
  milk_tea: { type: "milk_tea", label: "\u5976\u8336", emoji: "\u{1F9CB}", color: "#C48A5A" },
  coffee: { type: "coffee", label: "\u5496\u5561", emoji: "\u2615", color: "#5D4037" },
  latte: { type: "latte", label: "\u62FF\u94C1", emoji: "\u{1F95B}", color: "#D7CCC8" },
  juice: { type: "juice", label: "\u679C\u6C41", emoji: "\u{1F9C3}", color: "#FF9800" },
  smoothie: { type: "smoothie", label: "\u6614\u6614", emoji: "\u{1F964}", color: "#E91E63" },
  soda: { type: "soda", label: "\u6C7D\u6C34", emoji: "\u{1F37E}", color: "#29B6F6" },
  matcha: { type: "matcha", label: "\u62B9\u8336", emoji: "\u{1F375}", color: "#66BB6A" },
  cocoa: { type: "cocoa", label: "\u53EF\u53EF", emoji: "\u{1F36B}", color: "#8D6E63" }
};
var ALL_DRINK_TYPES = Object.keys(DRINKS);
function isDrinkType(v) {
  return v in DRINKS;
}

// src/core/scoring.ts
function computeStars(snap, initialItemsUsed) {
  if (snap.status !== "won") return 0;
  let score = 1;
  const slotPressure = snap.slot.length / Math.max(1, snap.slotCapacity);
  if (slotPressure <= 0.35) score += 1;
  if (snap.moveLeft >= 3 && initialItemsUsed <= 2) score += 1;
  else if (initialItemsUsed === 0) score += 1;
  return Math.min(3, score);
}

// src/core/level.ts
var cupSeq = 0;
function nextCupId(prefix = "c") {
  cupSeq += 1;
  return `${prefix}${cupSeq}`;
}
function defaultInventory(partial) {
  var _a, _b, _c, _d, _e, _f;
  return {
    undo: (_a = partial == null ? void 0 : partial.undo) != null ? _a : 1,
    magnet: (_b = partial == null ? void 0 : partial.magnet) != null ? _b : 1,
    expand: (_c = partial == null ? void 0 : partial.expand) != null ? _c : 1,
    reshuffle: (_d = partial == null ? void 0 : partial.reshuffle) != null ? _d : 1,
    ice_pick: (_e = partial == null ? void 0 : partial.ice_pick) != null ? _e : 1,
    key: (_f = partial == null ? void 0 : partial.key) != null ? _f : 0
  };
}
function buildGrid(config) {
  if (config.grid.length !== config.rows) {
    throw new Error(`level ${config.id}: grid rows ${config.grid.length} != rows ${config.rows}`);
  }
  return config.grid.map((row, r) => {
    if (row.length !== config.cols) {
      throw new Error(`level ${config.id}: row ${r} cols ${row.length} != cols ${config.cols}`);
    }
    return row.map((cell) => {
      var _a, _b;
      const iced = (_a = cell.iced) != null ? _a : [];
      const locked = (_b = cell.locked) != null ? _b : [];
      const stack = cell.stack.map((type, i) => {
        if (!isDrinkType(type)) throw new Error(`invalid drink type: ${type}`);
        return {
          id: nextCupId(config.id),
          type,
          iced: iced[i] === true,
          locked: locked[i] === true
        };
      });
      return { stack };
    });
  });
}
function countCups(grid) {
  let n = 0;
  for (const row of grid) for (const cell of row) n += cell.stack.length;
  return n;
}
function cloneGrid(grid) {
  return grid.map(
    (row) => row.map((cell) => ({
      stack: cell.stack.map((c) => ({ ...c }))
    }))
  );
}
function cloneInventory(inv) {
  return { ...inv };
}

// src/core/validate.ts
function validateLevel(config) {
  var _a;
  const errors = [];
  const warnings = [];
  const typeCounts = {};
  if (!config.id) errors.push("missing id");
  if (!config.name) errors.push("missing name");
  if (config.rows < 1 || config.cols < 1) errors.push("rows/cols must be >= 1");
  if (!Array.isArray(config.grid)) errors.push("grid must be array");
  let totalCups = 0;
  if (Array.isArray(config.grid)) {
    if (config.grid.length !== config.rows) {
      errors.push(`grid has ${config.grid.length} rows, expected ${config.rows}`);
    }
    config.grid.forEach((row, r) => {
      if (!Array.isArray(row)) {
        errors.push(`row ${r} is not array`);
        return;
      }
      if (row.length !== config.cols) {
        errors.push(`row ${r} has ${row.length} cols, expected ${config.cols}`);
      }
      row.forEach((cell, c) => {
        var _a2;
        if (!cell || !Array.isArray(cell.stack)) {
          errors.push(`cell[${r}][${c}] missing stack`);
          return;
        }
        if (cell.iced && cell.iced.length !== cell.stack.length) {
          errors.push(`cell[${r}][${c}] iced length mismatch`);
        }
        if (cell.locked && cell.locked.length !== cell.stack.length) {
          errors.push(`cell[${r}][${c}] locked length mismatch`);
        }
        for (const t of cell.stack) {
          if (!isDrinkType(t)) errors.push(`cell[${r}][${c}] invalid type ${t}`);
          else {
            typeCounts[t] = ((_a2 = typeCounts[t]) != null ? _a2 : 0) + 1;
            totalCups += 1;
          }
        }
      });
    });
  }
  if (totalCups === 0) errors.push("level has zero cups");
  if (totalCups % 3 !== 0) errors.push(`total cups ${totalCups} not divisible by 3`);
  for (const [t, n] of Object.entries(typeCounts)) {
    if (n % 3 !== 0) errors.push(`type ${t} count ${n} not divisible by 3`);
  }
  const slot = (_a = config.slotCapacity) != null ? _a : 7;
  if (slot < 5 || slot > 8) warnings.push(`slotCapacity ${slot} outside typical 5\u20138`);
  if (totalCups < 30) warnings.push("small level (<30 cups); long-session target is 90\u2013120");
  if (totalCups > 150) warnings.push("very large level (>150 cups)");
  return { ok: errors.length === 0, errors, warnings, totalCups, typeCounts };
}
function assertLevelValid(config) {
  const v = validateLevel(config);
  if (!v.ok) throw new Error(`invalid level ${config.id}: ${v.errors.join("; ")}`);
}

// src/core/engine.ts
var MAX_SLOT = 8;
var GameEngine = class {
  constructor(config, ad = {}) {
    __publicField(this, "grid");
    __publicField(this, "slot", []);
    __publicField(this, "slotCapacity");
    __publicField(this, "moveLeft");
    __publicField(this, "inventory");
    __publicField(this, "cleared", 0);
    __publicField(this, "totalCups");
    __publicField(this, "step", 0);
    __publicField(this, "status", "playing");
    __publicField(this, "stars", 0);
    __publicField(this, "history", []);
    __publicField(this, "itemsUsed", 0);
    __publicField(this, "levelId");
    __publicField(this, "ad");
    var _a, _b;
    assertLevelValid(config);
    this.levelId = config.id;
    this.ad = ad;
    this.grid = buildGrid(config);
    this.totalCups = countCups(this.grid);
    this.slotCapacity = Math.min(MAX_SLOT, (_a = config.slotCapacity) != null ? _a : 7);
    this.moveLeft = (_b = config.moveQuota) != null ? _b : 12;
    this.inventory = defaultInventory(config.items);
  }
  getLevelId() {
    return this.levelId;
  }
  getState() {
    return {
      grid: cloneGrid(this.grid),
      slot: this.slot.map((c) => ({ ...c })),
      slotCapacity: this.slotCapacity,
      moveLeft: this.moveLeft,
      inventory: cloneInventory(this.inventory),
      cleared: this.cleared,
      totalCups: this.totalCups,
      step: this.step,
      status: this.status,
      stars: this.stars,
      historyLen: this.history.length
    };
  }
  /** 顶杯是否可被点选进入出杯槽 */
  canTap(row, col) {
    if (this.status !== "playing") return false;
    const cup = this.topCup(row, col);
    if (!cup) return false;
    if (cup.iced) return false;
    if (cup.locked) return false;
    if (this.slot.length >= this.slotCapacity) return false;
    return true;
  }
  /** 列出所有露出且可操作的杯子坐标 */
  listExposed() {
    const out = [];
    for (let r = 0; r < this.grid.length; r++) {
      for (let c = 0; c < this.grid[r].length; c++) {
        const cup = this.topCup(r, c);
        if (cup) out.push({ row: r, col: c, cup: { ...cup }, tappable: this.canTap(r, c) });
      }
    }
    return out;
  }
  tapCup(row, col) {
    if (this.status !== "playing") return { ok: false, reason: "game_over" };
    const cup = this.topCup(row, col);
    if (!cup) return { ok: false, reason: "empty" };
    if (cup.iced) return { ok: false, reason: "iced" };
    if (cup.locked) return { ok: false, reason: "locked" };
    if (this.slot.length >= this.slotCapacity) return { ok: false, reason: "slot_full" };
    this.pushHistory();
    this.grid[row][col].stack.pop();
    this.slot.push(cup);
    this.step += 1;
    const clearedTypes = this.resolveSlotMatches();
    this.shatterAdjacentIce(row, col);
    this.recheckStatus();
    return { ok: true, clearedTypes, message: clearedTypes.length ? "matched" : "tapped" };
  }
  /** 同行相邻空位滑动露出的杯子一格 */
  slideCup(row, col, dir) {
    if (this.status !== "playing") return { ok: false, reason: "game_over" };
    if (this.moveLeft <= 0) return { ok: false, reason: "no_moves" };
    const cup = this.topCup(row, col);
    if (!cup) return { ok: false, reason: "empty" };
    if (cup.iced || cup.locked) return { ok: false, reason: "blocked" };
    const targetCol = dir === "left" ? col - 1 : col + 1;
    if (targetCol < 0 || targetCol >= this.grid[row].length) {
      return { ok: false, reason: "out_of_bounds" };
    }
    if (this.grid[row][targetCol].stack.length > 0) {
      return { ok: false, reason: "target_occupied" };
    }
    this.pushHistory();
    this.grid[row][col].stack.pop();
    this.grid[row][targetCol].stack.push(cup);
    this.moveLeft -= 1;
    this.step += 1;
    return { ok: true, message: "slid" };
  }
  useItem(item, payload) {
    var _a;
    if (this.status !== "playing") return { ok: false, reason: "game_over" };
    if (((_a = this.inventory[item]) != null ? _a : 0) <= 0) return { ok: false, reason: "no_item" };
    switch (item) {
      case "undo":
        return this.doUndo();
      case "magnet":
        if (!(payload == null ? void 0 : payload.type)) return { ok: false, reason: "need_type" };
        return this.doMagnet(payload.type);
      case "expand":
        return this.doExpand();
      case "reshuffle":
        return this.doReshuffle();
      case "ice_pick":
        if ((payload == null ? void 0 : payload.row) === void 0 || (payload == null ? void 0 : payload.col) === void 0) {
          return { ok: false, reason: "need_cell" };
        }
        return this.doIcePick(payload.row, payload.col);
      case "key":
        if ((payload == null ? void 0 : payload.row) === void 0 || (payload == null ? void 0 : payload.col) === void 0) {
          return { ok: false, reason: "need_cell" };
        }
        return this.doKey(payload.row, payload.col);
      default:
        return { ok: false, reason: "unknown_item" };
    }
  }
  /** 广告占位：看完激励视频解锁锁定顶杯 */
  async unlockWithAd(row, col) {
    if (this.status !== "playing") return { ok: false, reason: "game_over" };
    const cup = this.topCup(row, col);
    if (!(cup == null ? void 0 : cup.locked)) return { ok: false, reason: "not_locked" };
    const ok = this.ad.showRewarded ? await this.ad.showRewarded("unlock_cup") : true;
    if (!ok) return { ok: false, reason: "ad_skipped" };
    this.pushHistory();
    cup.locked = false;
    this.step += 1;
    return { ok: true, message: "unlocked_by_ad" };
  }
  isWon() {
    return this.status === "won";
  }
  isLost() {
    return this.status === "lost";
  }
  // --- internals ---
  topCup(row, col) {
    if (row < 0 || row >= this.grid.length) return void 0;
    if (col < 0 || col >= this.grid[row].length) return void 0;
    const stack = this.grid[row][col].stack;
    return stack[stack.length - 1];
  }
  pushHistory() {
    this.history.push({
      grid: cloneGrid(this.grid),
      slot: this.slot.map((c) => ({ ...c })),
      slotCapacity: this.slotCapacity,
      moveLeft: this.moveLeft,
      inventory: cloneInventory(this.inventory),
      cleared: this.cleared,
      status: this.status
    });
    if (this.history.length > 40) this.history.shift();
  }
  resolveSlotMatches() {
    var _a;
    const cleared = [];
    let changed = true;
    while (changed) {
      changed = false;
      const counts = /* @__PURE__ */ new Map();
      for (const c of this.slot) counts.set(c.type, ((_a = counts.get(c.type)) != null ? _a : 0) + 1);
      for (const [type, n] of counts) {
        if (n >= 3) {
          let remove = 3;
          const next = [];
          for (const c of this.slot) {
            if (c.type === type && remove > 0) {
              remove -= 1;
              continue;
            }
            next.push(c);
          }
          this.slot = next;
          this.cleared += 3;
          cleared.push(type);
          changed = true;
          break;
        }
      }
    }
    return cleared;
  }
  /** 相邻消除震碎：当某格刚被取走杯子后，检查四邻顶杯冰块 */
  shatterAdjacentIce(row, col) {
    const dirs = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0]
    ];
    for (const [dr, dc] of dirs) {
      const cup = this.topCup(row + dr, col + dc);
      if (cup == null ? void 0 : cup.iced) cup.iced = false;
    }
  }
  recheckStatus() {
    const leftOnShelf = countCups(this.grid);
    if (leftOnShelf === 0 && this.slot.length === 0) {
      this.status = "won";
      this.stars = computeStars(this.getState(), this.itemsUsed);
      return;
    }
    if (this.slot.length >= this.slotCapacity) {
      const canMatch = this.slotCanMatch();
      if (!canMatch) {
        this.status = "lost";
        this.stars = 0;
      }
    }
  }
  slotCanMatch() {
    var _a;
    const counts = /* @__PURE__ */ new Map();
    for (const c of this.slot) counts.set(c.type, ((_a = counts.get(c.type)) != null ? _a : 0) + 1);
    for (const n of counts.values()) if (n >= 3) return true;
    return false;
  }
  consumeItem(item) {
    this.inventory[item] -= 1;
    this.itemsUsed += 1;
  }
  doUndo() {
    if (this.history.length === 0) return { ok: false, reason: "no_history" };
    this.consumeItem("undo");
    const prev = this.history.pop();
    this.grid = prev.grid;
    this.slot = prev.slot;
    this.slotCapacity = prev.slotCapacity;
    this.moveLeft = prev.moveLeft;
    this.inventory = prev.inventory;
    this.inventory = prev.inventory;
    if (this.inventory.undo > 0) this.inventory.undo -= 1;
    else this.inventory.undo = 0;
    this.cleared = prev.cleared;
    this.status = prev.status;
    this.step += 1;
    return { ok: true, message: "undone" };
  }
  doMagnet(type) {
    this.pushHistory();
    this.consumeItem("magnet");
    let taken = 0;
    while (taken < 2 && this.slot.length < this.slotCapacity) {
      let got = false;
      outer: for (let r = 0; r < this.grid.length; r++) {
        for (let c = 0; c < this.grid[r].length; c++) {
          const cup = this.topCup(r, c);
          if (!cup || cup.type !== type) continue;
          if (cup.iced || cup.locked) continue;
          this.grid[r][c].stack.pop();
          this.slot.push(cup);
          taken += 1;
          got = true;
          break outer;
        }
      }
      if (!got) break;
    }
    if (taken === 0) {
      const prev = this.history.pop();
      this.grid = prev.grid;
      this.slot = prev.slot;
      this.slotCapacity = prev.slotCapacity;
      this.moveLeft = prev.moveLeft;
      this.inventory = prev.inventory;
      this.cleared = prev.cleared;
      this.status = prev.status;
      return { ok: false, reason: "no_target" };
    }
    const clearedTypes = this.resolveSlotMatches();
    this.step += 1;
    this.recheckStatus();
    return { ok: true, clearedTypes, message: `magnet_${taken}` };
  }
  doExpand() {
    if (this.slotCapacity >= MAX_SLOT) return { ok: false, reason: "max_slot" };
    this.pushHistory();
    this.consumeItem("expand");
    this.slotCapacity += 1;
    this.step += 1;
    if (this.status === "lost") this.status = "playing";
    this.recheckStatus();
    return { ok: true, message: "expanded" };
  }
  doReshuffle() {
    this.pushHistory();
    this.consumeItem("reshuffle");
    const movable = [];
    const anchors = [];
    for (let r = 0; r < this.grid.length; r++) {
      for (let c = 0; c < this.grid[r].length; c++) {
        this.grid[r][c].stack.forEach((cup, i) => {
          if (cup.iced || cup.locked) anchors.push({ r, c, i, cup });
          else movable.push(cup);
        });
      }
    }
    for (let i = movable.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [movable[i], movable[j]] = [movable[j], movable[i]];
    }
    let mi = 0;
    for (let r = 0; r < this.grid.length; r++) {
      for (let c = 0; c < this.grid[r].length; c++) {
        const stack = this.grid[r][c].stack;
        for (let i = 0; i < stack.length; i++) {
          if (stack[i].iced || stack[i].locked) continue;
          stack[i] = movable[mi++];
        }
      }
    }
    this.step += 1;
    return { ok: true, message: "reshuffled" };
  }
  doIcePick(row, col) {
    const cup = this.topCup(row, col);
    if (!(cup == null ? void 0 : cup.iced)) return { ok: false, reason: "not_iced" };
    this.pushHistory();
    this.consumeItem("ice_pick");
    cup.iced = false;
    this.step += 1;
    return { ok: true, message: "ice_cleared" };
  }
  doKey(row, col) {
    const cup = this.topCup(row, col);
    if (!(cup == null ? void 0 : cup.locked)) return { ok: false, reason: "not_locked" };
    this.pushHistory();
    this.consumeItem("key");
    cup.locked = false;
    this.step += 1;
    return { ok: true, message: "unlocked" };
  }
};

// levels/level_01.json
var level_01_default = {
  id: "level_01",
  name: "\u65B0\u624B\u67DC \xB7 \u5F00\u4E1A\u7B2C\u4E00\u5929",
  rows: 2,
  cols: 3,
  slotCapacity: 7,
  moveQuota: 8,
  items: {
    undo: 1,
    magnet: 1,
    expand: 1,
    reshuffle: 0,
    ice_pick: 0,
    key: 0
  },
  grid: [
    [
      {
        stack: [
          "milk_tea",
          "milk_tea",
          "milk_tea"
        ]
      },
      {
        stack: [
          "coffee",
          "coffee",
          "coffee"
        ]
      },
      {
        stack: [
          "latte",
          "latte",
          "latte"
        ]
      }
    ],
    [
      {
        stack: [
          "juice",
          "juice",
          "juice"
        ]
      },
      {
        stack: [
          "matcha",
          "matcha",
          "matcha"
        ]
      },
      {
        stack: [
          "soda",
          "soda",
          "soda"
        ]
      }
    ]
  ],
  meta: {
    estimatedMinutes: [
      3,
      5
    ],
    description: "\u6559\u5B66\u5173\uFF1A\u6BCF\u683C\u4E09\u540C\uFF0C\u70B9\u9009\u5373\u53EF\u6E05\u573A\u3002"
  }
};

// levels/level_02.json
var level_02_default = {
  id: "level_02",
  name: "\u5348\u540E\u9AD8\u5CF0\u67DC",
  rows: 5,
  cols: 4,
  slotCapacity: 7,
  moveQuota: 18,
  items: {
    undo: 2,
    magnet: 2,
    expand: 1,
    reshuffle: 1,
    ice_pick: 4,
    key: 2
  },
  grid: [
    [
      {
        stack: [
          "milk_tea",
          "milk_tea",
          "milk_tea",
          "soda",
          "soda"
        ]
      },
      {
        stack: [
          "soda",
          "latte",
          "latte",
          "latte",
          "soda"
        ]
      },
      {
        stack: [
          "soda",
          "soda",
          "milk_tea",
          "milk_tea",
          "milk_tea"
        ]
      },
      {
        stack: [
          "soda",
          "soda",
          "soda",
          "coffee",
          "coffee"
        ],
        iced: [
          false,
          false,
          true,
          false,
          false
        ],
        locked: [
          false,
          false,
          false,
          false,
          false
        ]
      }
    ],
    [
      {
        stack: [
          "coffee",
          "coffee",
          "coffee",
          "coffee",
          "juice"
        ]
      },
      {
        stack: [
          "juice",
          "juice",
          "coffee",
          "coffee",
          "coffee"
        ]
      },
      {
        stack: [
          "smoothie",
          "smoothie",
          "smoothie",
          "soda",
          "soda"
        ],
        iced: [
          false,
          false,
          false,
          false,
          false
        ],
        locked: [
          false,
          false,
          false,
          true,
          false
        ]
      },
      {
        stack: [
          "soda",
          "smoothie",
          "smoothie",
          "smoothie",
          "juice"
        ],
        iced: [
          false,
          false,
          false,
          true,
          false
        ],
        locked: [
          false,
          false,
          false,
          false,
          false
        ]
      }
    ],
    [
      {
        stack: [
          "juice",
          "juice",
          "latte",
          "latte",
          "latte"
        ],
        iced: [
          false,
          false,
          false,
          false,
          false
        ],
        locked: [
          false,
          false,
          false,
          true,
          false
        ]
      },
      {
        stack: [
          "smoothie",
          "smoothie",
          "smoothie",
          "milk_tea",
          "milk_tea"
        ]
      },
      {
        stack: [
          "milk_tea",
          "smoothie",
          "smoothie",
          "smoothie",
          "juice"
        ]
      },
      {
        stack: [
          "juice",
          "juice",
          "latte",
          "latte",
          "latte"
        ],
        iced: [
          false,
          true,
          false,
          false,
          false
        ],
        locked: [
          false,
          false,
          false,
          false,
          false
        ]
      }
    ],
    [
      {
        stack: [
          "soda",
          "soda",
          "soda",
          "juice",
          "juice"
        ],
        iced: [
          false,
          false,
          false,
          false,
          true
        ],
        locked: [
          false,
          false,
          false,
          false,
          false
        ]
      },
      {
        stack: [
          "juice",
          "smoothie",
          "smoothie",
          "smoothie",
          "smoothie"
        ]
      },
      {
        stack: [
          "smoothie",
          "smoothie",
          "soda",
          "soda",
          "soda"
        ]
      },
      {
        stack: [
          "latte",
          "latte",
          "latte",
          "milk_tea",
          "milk_tea"
        ]
      }
    ],
    [
      {
        stack: [
          "milk_tea",
          "latte",
          "latte",
          "latte"
        ]
      },
      {
        stack: [
          "coffee",
          "coffee",
          "coffee",
          "juice"
        ]
      },
      {
        stack: [
          "juice",
          "juice",
          "milk_tea",
          "milk_tea"
        ]
      },
      {
        stack: [
          "milk_tea",
          "coffee",
          "coffee",
          "coffee"
        ]
      }
    ]
  ],
  meta: {
    estimatedMinutes: [
      8,
      12
    ],
    description: "\u6807\u51C6\u957F\u5C40\uFF1A\u7EA6 96 \u676F\uFF0C\u542B\u5C11\u91CF\u51B0\u5757\u4E0E\u9501\u5B9A\u3002"
  }
};

// levels/level_03.json
var level_03_default = {
  id: "level_03",
  name: "\u6DF1\u591C\u6E05\u573A\u6311\u6218",
  rows: 6,
  cols: 5,
  slotCapacity: 7,
  moveQuota: 22,
  items: {
    undo: 2,
    magnet: 2,
    expand: 1,
    reshuffle: 1,
    ice_pick: 8,
    key: 4
  },
  grid: [
    [
      {
        stack: [
          "latte",
          "latte",
          "latte",
          "coffee"
        ],
        iced: [
          false,
          false,
          true,
          false
        ],
        locked: [
          false,
          false,
          false,
          false
        ]
      },
      {
        stack: [
          "coffee",
          "coffee",
          "matcha",
          "matcha"
        ],
        iced: [
          false,
          false,
          false,
          false
        ],
        locked: [
          false,
          true,
          false,
          false
        ]
      },
      {
        stack: [
          "matcha",
          "matcha",
          "matcha",
          "matcha"
        ]
      },
      {
        stack: [
          "juice",
          "juice",
          "juice",
          "milk_tea"
        ]
      },
      {
        stack: [
          "milk_tea",
          "milk_tea",
          "soda",
          "soda"
        ]
      }
    ],
    [
      {
        stack: [
          "soda",
          "soda",
          "soda",
          "soda"
        ],
        iced: [
          false,
          false,
          true,
          true
        ],
        locked: [
          false,
          false,
          false,
          false
        ]
      },
      {
        stack: [
          "soda",
          "soda",
          "soda",
          "smoothie"
        ],
        iced: [
          false,
          false,
          true,
          false
        ],
        locked: [
          false,
          false,
          false,
          false
        ]
      },
      {
        stack: [
          "smoothie",
          "smoothie",
          "milk_tea",
          "milk_tea"
        ]
      },
      {
        stack: [
          "milk_tea",
          "cocoa",
          "cocoa",
          "cocoa"
        ]
      },
      {
        stack: [
          "coffee",
          "coffee",
          "coffee",
          "juice"
        ]
      }
    ],
    [
      {
        stack: [
          "juice",
          "juice",
          "matcha",
          "matcha"
        ]
      },
      {
        stack: [
          "matcha",
          "cocoa",
          "cocoa",
          "cocoa"
        ]
      },
      {
        stack: [
          "coffee",
          "coffee",
          "coffee",
          "cocoa"
        ]
      },
      {
        stack: [
          "cocoa",
          "cocoa",
          "milk_tea",
          "milk_tea"
        ]
      },
      {
        stack: [
          "milk_tea",
          "matcha",
          "matcha",
          "matcha"
        ]
      }
    ],
    [
      {
        stack: [
          "matcha",
          "matcha",
          "matcha",
          "cocoa"
        ]
      },
      {
        stack: [
          "cocoa",
          "cocoa",
          "juice",
          "juice"
        ]
      },
      {
        stack: [
          "juice",
          "smoothie",
          "smoothie",
          "smoothie"
        ],
        iced: [
          false,
          false,
          false,
          true
        ],
        locked: [
          false,
          false,
          false,
          false
        ]
      },
      {
        stack: [
          "juice",
          "juice",
          "juice",
          "soda"
        ],
        iced: [
          false,
          false,
          false,
          true
        ],
        locked: [
          false,
          true,
          false,
          false
        ]
      },
      {
        stack: [
          "soda",
          "soda",
          "milk_tea",
          "milk_tea"
        ],
        iced: [
          false,
          false,
          false,
          true
        ],
        locked: [
          false,
          true,
          false,
          false
        ]
      }
    ],
    [
      {
        stack: [
          "milk_tea",
          "coffee",
          "coffee",
          "coffee"
        ],
        iced: [
          false,
          false,
          false,
          true
        ],
        locked: [
          false,
          false,
          false,
          false
        ]
      },
      {
        stack: [
          "juice",
          "juice",
          "juice",
          "smoothie"
        ]
      },
      {
        stack: [
          "smoothie",
          "smoothie",
          "coffee",
          "coffee"
        ],
        iced: [
          false,
          false,
          false,
          false
        ],
        locked: [
          false,
          false,
          true,
          false
        ]
      },
      {
        stack: [
          "coffee",
          "soda",
          "soda",
          "soda"
        ]
      },
      {
        stack: [
          "latte",
          "latte",
          "latte",
          "milk_tea"
        ]
      }
    ],
    [
      {
        stack: [
          "milk_tea",
          "milk_tea",
          "smoothie",
          "smoothie"
        ]
      },
      {
        stack: [
          "smoothie",
          "latte",
          "latte",
          "latte"
        ]
      },
      {
        stack: [
          "latte",
          "latte",
          "latte",
          "smoothie"
        ]
      },
      {
        stack: [
          "smoothie",
          "smoothie",
          "cocoa",
          "cocoa"
        ]
      },
      {
        stack: [
          "cocoa",
          "latte",
          "latte",
          "latte"
        ]
      }
    ]
  ],
  meta: {
    estimatedMinutes: [
      12,
      15
    ],
    description: "\u9AD8\u538B\u957F\u5C40\uFF1A120 \u676F\uFF0C\u969C\u788D\u66F4\u591A\uFF0C\u9053\u5177\u914D\u989D\u66F4\u7D27\u3002"
  }
};

// src/wechat/main.ts
var LEVELS = {
  level_01: level_01_default,
  level_02: level_02_default,
  level_03: level_03_default
};
var ITEM_LABELS = [
  { id: "undo", label: "\u64A4\u9500" },
  { id: "magnet", label: "\u78C1\u94C1" },
  { id: "expand", label: "\u6269\u69FD" },
  { id: "reshuffle", label: "\u6D17\u724C" },
  { id: "ice_pick", label: "\u51B0\u9525" }
];
var canvas;
var ctx;
var W = 375;
var H = 667;
var dpr = 1;
var engine;
var currentId = "level_01";
var slideMode = false;
var slideFrom = null;
var magnetArm = false;
var icePickArm = false;
var statusMsg = "\u70B9\u9732\u51FA\u7684\u676F\u5B50\u8FDB\u5165\u51FA\u676F\u69FD";
var hits = [];
function toast(title) {
  statusMsg = title;
  if (typeof wx !== "undefined" && wx.showToast) {
    try {
      wx.showToast({ title: title.slice(0, 14), icon: "none", duration: 1200 });
    } catch (e) {
    }
  }
}
function loadLevel(id) {
  const cfg = LEVELS[id];
  if (!cfg) {
    toast("\u5173\u5361\u4E0D\u5B58\u5728");
    return;
  }
  currentId = id;
  engine = new GameEngine(cfg, {
    showRewarded: async () => true
  });
  slideMode = false;
  slideFrom = null;
  magnetArm = false;
  icePickArm = false;
  statusMsg = `\u8F7D\u5165\u300C${cfg.name}\u300D`;
  draw();
}
function layoutCell(cols, rows) {
  const pad = 16;
  const topHud = 110;
  const bottomBar = 200;
  const availW = W - pad * 2;
  const availH = H - topHud - bottomBar;
  const gap = 8;
  const cellW = (availW - gap * (cols - 1)) / cols;
  const cellH = Math.min(96, (availH - gap * (rows - 1)) / rows);
  const originX = pad;
  const originY = topHud;
  return { originX, originY, cellW, cellH, gap };
}
function roundRect(x, y, w, h, r, fill, stroke) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
function drawText(text, x, y, size, color, align = "left", baseline = "top") {
  ctx.font = `${size}px sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(text, x, y);
}
function draw() {
  var _a, _b;
  hits = [];
  const st = engine.getState();
  const rows = st.grid.length;
  const cols = (_b = (_a = st.grid[0]) == null ? void 0 : _a.length) != null ? _b : 1;
  const L = layoutCell(cols, rows);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#1a1423";
  ctx.fillRect(0, 0, W, H);
  drawText("\u676F\u67DC\u6E05\u573A", 16, 16, 22, "#fff");
  drawText(
    `\u6D88\u9664 ${st.cleared}/${st.totalCups}  \xB7  \u69FD ${st.slot.length}/${st.slotCapacity}  \xB7  \u632A\u4F4D ${st.moveLeft}`,
    16,
    46,
    13,
    "#cbb8e8"
  );
  drawText(`\u6B65\u6570 ${st.step}  \xB7  \u2B50 ${st.stars}`, 16, 66, 13, "#cbb8e8");
  let banner = statusMsg;
  if (st.status === "won") banner = `\u6E05\u573A\u6210\u529F\uFF01\u661F\u7EA7 ${st.stars}`;
  else if (st.status === "lost") banner = "\u69FD\u6EE1\u5931\u8D25 \u2014 \u8BD5\u8BD5\u64A4\u9500/\u6269\u69FD/\u78C1\u94C1";
  else if (slideMode) banner = "\u632A\u4F4D\uFF1A\u5148\u70B9\u676F\u5B50\uFF0C\u518D\u70B9\u540C\u884C\u76F8\u90BB\u7A7A\u4F4D";
  else if (magnetArm) banner = "\u78C1\u94C1\uFF1A\u70B9\u4E00\u4E2A\u9732\u51FA\u676F\u5B50\u9009\u79CD\u7C7B";
  else if (icePickArm) banner = "\u51B0\u9525\uFF1A\u70B9\u7ED3\u51B0\u9876\u676F";
  drawText(banner, 16, 86, 12, "#ffd54f");
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = L.originX + c * (L.cellW + L.gap);
      const y = L.originY + r * (L.cellH + L.gap);
      const cell = st.grid[r][c];
      const top = cell.stack[cell.stack.length - 1];
      if (!top) {
        roundRect(x, y, L.cellW, L.cellH, 10, "#2a2238", "#4a3f5c");
        drawText("\u7A7A", x + L.cellW / 2, y + L.cellH / 2, 14, "#8877aa", "center", "middle");
        hits.push({ x, y, w: L.cellW, h: L.cellH, kind: "empty", row: r, col: c });
      } else {
        const meta = DRINKS[top.type];
        const blocked = !!(top.iced || top.locked);
        roundRect(x, y, L.cellW, L.cellH, 10, meta.color, blocked ? "#fff" : "#00000033");
        drawText(meta.emoji, x + L.cellW / 2, y + L.cellH / 2 - 10, 28, "#111", "center", "middle");
        const flags = `${top.iced ? "\u51B0" : ""}${top.locked ? "\u9501" : ""}`;
        drawText(
          `${meta.label}${flags ? "(" + flags + ")" : ""}`,
          x + L.cellW / 2,
          y + L.cellH - 28,
          11,
          "#111",
          "center",
          "top"
        );
        drawText(`\xD7${cell.stack.length}`, x + L.cellW / 2, y + L.cellH - 14, 10, "#333", "center", "top");
        hits.push({ x, y, w: L.cellW, h: L.cellH, kind: "cup", row: r, col: c });
      }
    }
  }
  const slotY = H - 170;
  const slotPad = 16;
  const slotGap = 6;
  const slotCell = Math.min(40, (W - slotPad * 2 - slotGap * (st.slotCapacity - 1)) / st.slotCapacity);
  drawText("\u51FA\u676F\u69FD", slotPad, slotY - 18, 12, "#cbb8e8");
  for (let i = 0; i < st.slotCapacity; i++) {
    const x = slotPad + i * (slotCell + slotGap);
    const cup = st.slot[i];
    roundRect(x, slotY, slotCell, slotCell, 8, cup ? DRINKS[cup.type].color : "#2a2238", "#5a4d6e");
    if (cup) {
      drawText(DRINKS[cup.type].emoji, x + slotCell / 2, slotY + slotCell / 2, 18, "#111", "center", "middle");
    }
  }
  const btnY = H - 110;
  const btns = [
    { label: slideMode ? "\u632A\u4F4D\u25CF" : "\u632A\u4F4D", action: "slide", accent: slideMode ? "#7c4dff" : void 0 },
    ...ITEM_LABELS.map((it) => {
      var _a2;
      return {
        label: `${it.label}${(_a2 = st.inventory[it.id]) != null ? _a2 : 0}`,
        item: it.id
      };
    }),
    { label: "\u91CD\u5F00", action: "restart" },
    { label: "\u5173\u5361", action: "nextLevel" }
  ];
  const bGap = 6;
  const bW = (W - 32 - bGap * (btns.length - 1)) / btns.length;
  const bH = 36;
  btns.forEach((b, i) => {
    var _a2, _b2;
    const x = 16 + i * (bW + bGap);
    const disabled = b.item != null && (((_a2 = st.inventory[b.item]) != null ? _a2 : 0) <= 0 || st.status !== "playing");
    const fill = (_b2 = b.accent) != null ? _b2 : disabled ? "#3a3148" : "#3d2f5c";
    roundRect(x, btnY, bW, bH, 8, fill, "#6a5a88");
    drawText(b.label, x + bW / 2, btnY + bH / 2, 10, disabled ? "#888" : "#fff", "center", "middle");
    if (b.item) {
      hits.push({ x, y: btnY, w: bW, h: bH, kind: "item", item: b.item });
    } else if (b.action) {
      hits.push({ x, y: btnY, w: bW, h: bH, kind: "btn", action: b.action });
    }
  });
  const ids = Object.keys(LEVELS);
  const chipY = H - 55;
  ids.forEach((id, i) => {
    const x = 16 + i * 110;
    const on = id === currentId;
    roundRect(x, chipY, 100, 28, 8, on ? "#5e35b1" : "#2a2238", "#6a5a88");
    drawText(LEVELS[id].name.slice(0, 8), x + 50, chipY + 14, 11, "#fff", "center", "middle");
    hits.push({ x, y: chipY, w: 100, h: 28, kind: "btn", action: `level:${id}` });
  });
}
function hitTest(px, py) {
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    if (px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h) return h;
  }
  return null;
}
function onCup(r, c) {
  var _a;
  if (magnetArm) {
    magnetArm = false;
    const top = engine.getState().grid[r][c].stack.at(-1);
    if (!top) return;
    const res2 = engine.useItem("magnet", { type: top.type });
    toast(res2.ok ? `\u78C1\u94C1\xB7${DRINKS[top.type].label}` : `\u78C1\u94C1\u5931\u8D25:${res2.reason}`);
    draw();
    return;
  }
  if (icePickArm) {
    icePickArm = false;
    const res2 = engine.useItem("ice_pick", { row: r, col: c });
    toast(res2.ok ? "\u51B0\u9525\u89E3\u51BB" : `\u5931\u8D25:${res2.reason}`);
    draw();
    return;
  }
  if (slideMode) {
    slideFrom = { r, c };
    toast(`\u8D77\u70B9(${r},${c})\uFF0C\u518D\u70B9\u76F8\u90BB\u7A7A\u4F4D`);
    draw();
    return;
  }
  const res = engine.tapCup(r, c);
  if (!res.ok) {
    if (res.reason === "iced") toast("\u51B0\u5757\u6321\u4F4F\u4E86\uFF0C\u7528\u51B0\u9525");
    else if (res.reason === "locked") {
      void engine.unlockWithAd(r, c).then((r2) => {
        toast(r2.ok ? "\u5DF2\u89E3\u9501" : `\u9501\u5B9A:${r2.reason}`);
        draw();
      });
      return;
    } else toast(`\u5931\u8D25:${res.reason}`);
  } else if ((_a = res.clearedTypes) == null ? void 0 : _a.length) {
    toast(`\u6D88\u9664 ${res.clearedTypes.map((t) => DRINKS[t].label).join("\u3001")}`);
  } else {
    toast("\u5165\u69FD");
  }
  draw();
}
function onEmpty(r, c) {
  if (!slideMode || !slideFrom) return;
  const { r: sr, c: sc } = slideFrom;
  if (sr !== r || Math.abs(c - sc) !== 1) {
    toast("\u53EA\u80FD\u6ED1\u5411\u540C\u884C\u76F8\u90BB\u7A7A\u4F4D");
    return;
  }
  const dir = c < sc ? "left" : "right";
  const res = engine.slideCup(sr, sc, dir);
  toast(res.ok ? `\u632A\u4F4D ${dir}` : `\u5931\u8D25:${res.reason}`);
  slideFrom = null;
  draw();
}
function onItem(item) {
  if (item === "magnet") {
    magnetArm = true;
    icePickArm = false;
    slideMode = false;
    toast("\u78C1\u94C1\uFF1A\u70B9\u9732\u51FA\u676F\u5B50");
    draw();
    return;
  }
  if (item === "ice_pick") {
    icePickArm = true;
    magnetArm = false;
    slideMode = false;
    toast("\u51B0\u9525\uFF1A\u70B9\u7ED3\u51B0\u9876\u676F");
    draw();
    return;
  }
  if (item === "undo" || item === "expand" || item === "reshuffle") {
    const res = engine.useItem(item);
    toast(res.ok ? `${item} \u2713` : `\u5931\u8D25:${res.reason}`);
    draw();
  }
}
function onBtn(action) {
  if (action === "slide") {
    slideMode = !slideMode;
    slideFrom = null;
    magnetArm = false;
    icePickArm = false;
    toast(slideMode ? "\u5F00\u542F\u632A\u4F4D" : "\u5173\u95ED\u632A\u4F4D");
    draw();
    return;
  }
  if (action === "restart") {
    loadLevel(currentId);
    return;
  }
  if (action === "nextLevel") {
    const ids = Object.keys(LEVELS);
    const idx = (ids.indexOf(currentId) + 1) % ids.length;
    loadLevel(ids[idx]);
    return;
  }
  if (action.startsWith("level:")) {
    loadLevel(action.slice(6));
  }
}
function onTouch(px, py) {
  const h = hitTest(px, py);
  if (!h) return;
  if (h.kind === "cup" && h.row != null && h.col != null) onCup(h.row, h.col);
  else if (h.kind === "empty" && h.row != null && h.col != null) onEmpty(h.row, h.col);
  else if (h.kind === "item" && h.item) onItem(h.item);
  else if (h.kind === "btn" && h.action) onBtn(h.action);
}
function boot() {
  const info = wx.getSystemInfoSync();
  W = info.windowWidth;
  H = info.windowHeight;
  dpr = info.pixelRatio || 1;
  canvas = wx.createCanvas();
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx = canvas.getContext("2d");
  wx.onTouchStart((e) => {
    const t = e.touches[0];
    if (!t) return;
    onTouch(t.clientX, t.clientY);
  });
  loadLevel("level_01");
}
boot();
//# sourceMappingURL=game.bundle.js.map
