"use strict";
(() => {
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
    return {
      undo: partial?.undo ?? 1,
      magnet: partial?.magnet ?? 1,
      expand: partial?.expand ?? 1,
      reshuffle: partial?.reshuffle ?? 1,
      ice_pick: partial?.ice_pick ?? 1,
      key: partial?.key ?? 0
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
        const iced = cell.iced ?? [];
        const locked = cell.locked ?? [];
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
              typeCounts[t] = (typeCounts[t] ?? 0) + 1;
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
    const slot = config.slotCapacity ?? 7;
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
    grid;
    slot = [];
    slotCapacity;
    moveLeft;
    inventory;
    cleared = 0;
    totalCups;
    step = 0;
    status = "playing";
    stars = 0;
    history = [];
    itemsUsed = 0;
    levelId;
    ad;
    constructor(config, ad = {}) {
      assertLevelValid(config);
      this.levelId = config.id;
      this.ad = ad;
      this.grid = buildGrid(config);
      this.totalCups = countCups(this.grid);
      this.slotCapacity = Math.min(MAX_SLOT, config.slotCapacity ?? 7);
      this.moveLeft = config.moveQuota ?? 12;
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
      if (this.status !== "playing") return { ok: false, reason: "game_over" };
      if ((this.inventory[item] ?? 0) <= 0) return { ok: false, reason: "no_item" };
      switch (item) {
        case "undo":
          return this.doUndo();
        case "magnet":
          if (!payload?.type) return { ok: false, reason: "need_type" };
          return this.doMagnet(payload.type);
        case "expand":
          return this.doExpand();
        case "reshuffle":
          return this.doReshuffle();
        case "ice_pick":
          if (payload?.row === void 0 || payload?.col === void 0) {
            return { ok: false, reason: "need_cell" };
          }
          return this.doIcePick(payload.row, payload.col);
        case "key":
          if (payload?.row === void 0 || payload?.col === void 0) {
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
      if (!cup?.locked) return { ok: false, reason: "not_locked" };
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
      const cleared = [];
      let changed = true;
      while (changed) {
        changed = false;
        const counts = /* @__PURE__ */ new Map();
        for (const c of this.slot) counts.set(c.type, (counts.get(c.type) ?? 0) + 1);
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
        if (cup?.iced) cup.iced = false;
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
      const counts = /* @__PURE__ */ new Map();
      for (const c of this.slot) counts.set(c.type, (counts.get(c.type) ?? 0) + 1);
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
      if (!cup?.iced) return { ok: false, reason: "not_iced" };
      this.pushHistory();
      this.consumeItem("ice_pick");
      cup.iced = false;
      this.step += 1;
      return { ok: true, message: "ice_cleared" };
    }
    doKey(row, col) {
      const cup = this.topCup(row, col);
      if (!cup?.locked) return { ok: false, reason: "not_locked" };
      this.pushHistory();
      this.consumeItem("key");
      cup.locked = false;
      this.step += 1;
      return { ok: true, message: "unlocked" };
    }
  };

  // src/preview/main.ts
  var engine;
  var currentId = "level_01";
  var slideMode = false;
  var slideFrom = null;
  var magnetArm = false;
  var shelfEl = () => document.getElementById("shelf");
  var slotEl = () => document.getElementById("slot");
  var hudEl = () => document.getElementById("hud");
  var statusEl = () => document.getElementById("status");
  var logEl = () => document.getElementById("log");
  function log(msg) {
    const line = document.createElement("div");
    line.textContent = msg;
    logEl().prepend(line);
  }
  async function fetchLevel(id) {
    const urls = [`./levels/${id}.json`, `../levels/${id}.json`, `/levels/${id}.json`];
    for (const u of urls) {
      try {
        const res = await fetch(u);
        if (res.ok) return await res.json();
      } catch {
      }
    }
    throw new Error(`cannot load level ${id}`);
  }
  function render() {
    const st = engine.getState();
    hudEl().innerHTML = [
      `<span>\u6D88\u9664 ${st.cleared}/${st.totalCups}</span>`,
      `<span>\u69FD ${st.slot.length}/${st.slotCapacity}</span>`,
      `<span>\u632A\u4F4D ${st.moveLeft}</span>`,
      `<span>\u6B65\u6570 ${st.step}</span>`,
      `<span>\u2B50 ${st.stars}</span>`
    ].join("");
    if (st.status === "won") statusEl().textContent = `\u6E05\u573A\u6210\u529F\uFF01\u661F\u7EA7 ${st.stars}`;
    else if (st.status === "lost") statusEl().textContent = "\u69FD\u6EE1\u5931\u8D25 \u2014 \u8BD5\u8BD5\u64A4\u9500 / \u6269\u69FD / \u78C1\u94C1";
    else if (slideMode) statusEl().textContent = "\u632A\u4F4D\u6A21\u5F0F\uFF1A\u70B9\u676F\u5B50\uFF0C\u518D\u70B9\u540C\u884C\u76F8\u90BB\u7A7A\u4F4D";
    else if (magnetArm) statusEl().textContent = "\u78C1\u94C1\uFF1A\u70B9\u51FB\u4E00\u4E2A\u9732\u51FA\u676F\u5B50\u9009\u62E9\u79CD\u7C7B";
    else statusEl().textContent = "\u70B9\u9732\u51FA\u7684\u676F\u5B50\u8FDB\u5165\u51FA\u676F\u69FD\uFF1B\u4E09\u540C\u6D88\u9664";
    const shelf = shelfEl();
    shelf.innerHTML = "";
    shelf.style.gridTemplateColumns = `repeat(${st.grid[0]?.length ?? 1}, minmax(72px, 1fr))`;
    st.grid.forEach((row, r) => {
      row.forEach((cell, c) => {
        const box = document.createElement("button");
        box.type = "button";
        box.className = "cell";
        const top = cell.stack[cell.stack.length - 1];
        if (!top) {
          box.classList.add("empty");
          box.textContent = "\u7A7A";
          box.onclick = () => onEmpty(r, c);
        } else {
          const meta = DRINKS[top.type];
          box.style.background = meta.color;
          const flags = `${top.iced ? "\u{1F9CA}" : ""}${top.locked ? "\u{1F512}" : ""}`;
          box.innerHTML = `<div class="emoji">${meta.emoji}</div><div class="label">${meta.label}${flags}</div><div class="depth">\xD7${cell.stack.length}</div>`;
          if (top.iced || top.locked) box.classList.add("blocked");
          box.onclick = () => onCup(r, c);
        }
        shelf.appendChild(box);
      });
    });
    const slot = slotEl();
    slot.innerHTML = "";
    for (let i = 0; i < st.slotCapacity; i++) {
      const s = document.createElement("div");
      s.className = "slot-cell";
      const cup = st.slot[i];
      if (cup) {
        const meta = DRINKS[cup.type];
        s.style.background = meta.color;
        s.textContent = meta.emoji;
        s.title = meta.label;
      }
      slot.appendChild(s);
    }
    document.querySelectorAll("#items button[data-item]").forEach((btn) => {
      const item = btn.dataset.item;
      const count = st.inventory[item] ?? 0;
      btn.disabled = count <= 0 || st.status !== "playing";
      const label = btn.getAttribute("data-label") ?? item;
      btn.textContent = `${label} (${count})`;
    });
  }
  function onCup(r, c) {
    if (magnetArm) {
      magnetArm = false;
      const top = engine.getState().grid[r][c].stack.at(-1);
      if (!top) return;
      const res2 = engine.useItem("magnet", { type: top.type });
      log(res2.ok ? `\u78C1\u94C1\u62BD\u53D6 ${DRINKS[top.type].label}` : `\u78C1\u94C1\u5931\u8D25: ${res2.reason}`);
      render();
      return;
    }
    if (slideMode) {
      slideFrom = { r, c };
      log(`\u632A\u4F4D\u8D77\u70B9 (${r},${c})\uFF0C\u518D\u70B9\u76F8\u90BB\u7A7A\u4F4D`);
      return;
    }
    const res = engine.tapCup(r, c);
    if (!res.ok) {
      if (res.reason === "iced") {
        const r2 = engine.useItem("ice_pick", { row: r, col: c });
        log(r2.ok ? "\u51B0\u9525\u89E3\u51BB" : "\u51B0\u5757\u6321\u4F4F\u4E86\uFF08\u9700\u8981\u51B0\u9525\uFF09");
      } else if (res.reason === "locked") {
        void engine.unlockWithAd(r, c).then((r2) => {
          log(r2.ok ? "\u5E7F\u544A\u5360\u4F4D\u89E3\u9501" : `\u9501\u5B9A: ${r2.reason}`);
          render();
        });
        return;
      } else {
        log(`\u5931\u8D25: ${res.reason}`);
      }
    } else if (res.clearedTypes?.length) {
      log(`\u6D88\u9664 ${res.clearedTypes.map((t) => DRINKS[t].label).join("\u3001")}`);
    } else {
      log("\u5165\u69FD");
    }
    render();
  }
  function onEmpty(r, c) {
    if (!slideMode || !slideFrom) return;
    const { r: sr, c: sc } = slideFrom;
    if (sr !== r || Math.abs(c - sc) !== 1) {
      log("\u53EA\u80FD\u6ED1\u5411\u540C\u884C\u76F8\u90BB\u7A7A\u4F4D");
      return;
    }
    const dir = c < sc ? "left" : "right";
    const res = engine.slideCup(sr, sc, dir);
    log(res.ok ? `\u632A\u4F4D ${dir}` : `\u632A\u4F4D\u5931\u8D25: ${res.reason}`);
    slideFrom = null;
    render();
  }
  async function loadLevel(id) {
    currentId = id;
    const cfg = await fetchLevel(id);
    engine = new GameEngine(cfg, {
      showRewarded: async () => {
        log("[\u5E7F\u544A\u5360\u4F4D] \u89C6\u4E3A\u5DF2\u89C2\u770B");
        return true;
      }
    });
    slideMode = false;
    slideFrom = null;
    magnetArm = false;
    log(`\u8F7D\u5165\u300C${cfg.name}\u300D`);
    render();
  }
  function boot() {
    document.getElementById("btn-restart").onclick = () => void loadLevel(currentId);
    document.getElementById("btn-slide").onclick = () => {
      slideMode = !slideMode;
      slideFrom = null;
      magnetArm = false;
      log(slideMode ? "\u5F00\u542F\u632A\u4F4D\u6A21\u5F0F" : "\u5173\u95ED\u632A\u4F4D\u6A21\u5F0F");
      render();
    };
    document.getElementById("level-select").onchange = (e) => {
      void loadLevel(e.target.value);
    };
    document.getElementById("items").onclick = (e) => {
      const btn = e.target.closest("button[data-item]");
      if (!btn) return;
      const item = btn.dataset.item;
      if (item === "magnet") {
        magnetArm = true;
        slideMode = false;
        log("\u78C1\u94C1\u5DF2\u4E3E\u8D77\uFF1A\u70B9\u51FB\u9732\u51FA\u676F\u5B50\u9009\u62E9\u79CD\u7C7B");
        render();
        return;
      }
      if (item === "undo" || item === "expand" || item === "reshuffle") {
        const res = engine.useItem(item);
        log(res.ok ? `${btn.getAttribute("data-label")} \u2713` : `\u5931\u8D25: ${res.reason}`);
        render();
      }
    };
    void loadLevel("level_01");
  }
  boot();
})();
//# sourceMappingURL=app.js.map
