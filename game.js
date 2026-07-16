"use strict";

// ===== SUPERNOVA =====
// 4色の星屑(元素)をタップで核融合。数字=原子番号は合計され、色は保たれる。
// Fe(26)以上で超新星(nova)化 — 恒星内の元素合成が鉄で止まるのと同じ。
// novaはnova同士のみ融合し、Og(118)を超えるとブラックホールになる。
// となり合う融合可能ペアが無くなったらゲームオーバー。

const SIZE = 5;
const COLORS = ["red", "yellow", "green", "blue"];
const NOVA_AT = 26; // Fe: これ以上は超新星でしか作れない
const HOLE_AT = 119; // 周期表の果て(Og=118)を超えるとブラックホール
const STORAGE_KEY = "supernova-best";

const ELEMENTS = [
  "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne",
  "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca",
  "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn",
  "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr",
  "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn",
  "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr", "Nd",
  "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb",
  "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg",
  "Tl", "Pb", "Bi", "Po", "At", "Rn", "Fr", "Ra", "Ac", "Th",
  "Pa", "U", "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es", "Fm",
  "Md", "No", "Lr", "Rf", "Db", "Sg", "Bh", "Hs", "Mt", "Ds",
  "Rg", "Cn", "Nh", "Fl", "Mc", "Lv", "Ts", "Og",
];

const boardEl = document.getElementById("board");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const overlayEl = document.getElementById("overlay");
const finalScoreEl = document.getElementById("final-score");
const newBestEl = document.getElementById("new-best");
const hintEl = document.getElementById("hint");

let grid; // grid[r][c] = tile or null
let score = 0;
let best = Number(localStorage.getItem(STORAGE_KEY) || 0);
let busy = false;
let nextId = 1;
let firstMergeDone = false;

// ---------- 表示ユーティリティ ----------

// タイルの段階: 色つき星屑 → nova(超新星) → hole(ブラックホール)
function tierOf(tile) {
  if (tile.value >= HOLE_AT) return "hole";
  if (tile.value >= NOVA_AT) return "nova";
  return null;
}

// 融合マッチングのキー。novaとholeは色を失いそれぞれ1つのグループになる
function keyOf(tile) {
  return tierOf(tile) ?? tile.color;
}

function fmt(v) {
  if (v >= 1e9) return (v / 1e9 >= 10 ? Math.round(v / 1e9) : (v / 1e9).toFixed(1)) + "B";
  if (v >= 1e6) return (v / 1e6 >= 10 ? Math.round(v / 1e6) : (v / 1e6).toFixed(1)) + "M";
  if (v >= 1e4) return (v / 1e3 >= 100 ? Math.round(v / 1e3) : (v / 1e3).toFixed(1).replace(/\.0$/, "")) + "k";
  return String(v);
}

function fontSizeFor(text, el) {
  // 盤面幅に対する相対サイズ。桁数が増えたら縮める
  const base = boardEl.clientWidth / SIZE;
  const scale = text.length <= 2 ? 0.4 : text.length <= 3 ? 0.34 : text.length <= 4 ? 0.28 : 0.24;
  el.style.setProperty("--fs", `${Math.round(base * scale)}px`);
  el.style.setProperty("--fs-mass", `${Math.round(base * 0.15)}px`);
}

function setTilePos(tile) {
  tile.el.style.transform = `translate(${tile.c * 100}%, ${tile.r * 100}%)`;
}

function refreshTileFace(tile) {
  tile.el.dataset.color = keyOf(tile);
  let symText, massText;
  if (tile.value >= HOLE_AT) {
    // 周期表の外側:質量だけのブラックホール
    symText = fmt(tile.value);
    massText = "";
  } else {
    symText = ELEMENTS[tile.value - 1];
    massText = String(tile.value);
  }
  tile.symEl.textContent = symText;
  tile.massEl.textContent = massText;
  fontSizeFor(symText, tile.el);
}

// ---------- タイル生成 ----------

function makeTile(value, color, r, c, spawnFromRow = null) {
  const el = document.createElement("div");
  el.className = "tile";
  const face = document.createElement("div");
  face.className = "face";
  const mass = document.createElement("span");
  mass.className = "mass";
  const sym = document.createElement("span");
  sym.className = "sym";
  face.appendChild(mass);
  face.appendChild(sym);
  el.appendChild(face);

  const tile = { id: nextId++, value, color, r, c, el, symEl: sym, massEl: mass, faceEl: face };
  refreshTileFace(tile);

  if (spawnFromRow !== null) {
    // 盤面の上から降ってくる
    el.style.transform = `translate(${c * 100}%, ${spawnFromRow * 100}%)`;
    el.classList.add("spawn");
    requestAnimationFrame(() => requestAnimationFrame(() => setTilePos(tile)));
  } else {
    setTilePos(tile);
  }

  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    onTap(tile);
  });

  boardEl.appendChild(el);
  setTimeout(() => el.classList.remove("spawn"), 300);
  return tile;
}

function randomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

// ---------- 盤面ロジック ----------

function neighbors(r, c) {
  const out = [];
  if (r > 0) out.push([r - 1, c]);
  if (r < SIZE - 1) out.push([r + 1, c]);
  if (c > 0) out.push([r, c - 1]);
  if (c < SIZE - 1) out.push([r, c + 1]);
  return out;
}

function findGroup(tile) {
  const k = keyOf(tile);
  const group = [];
  const seen = new Set([tile.id]);
  const stack = [tile];
  while (stack.length) {
    const t = stack.pop();
    group.push(t);
    for (const [nr, nc] of neighbors(t.r, t.c)) {
      const n = grid[nr][nc];
      if (n && !seen.has(n.id) && keyOf(n) === k) {
        seen.add(n.id);
        stack.push(n);
      }
    }
  }
  return group;
}

// となり合う同キャラ(色/nova/hole)のタイルを見た目上くっつける。
// あわせて「融合したら次の段階に進むグループ」を全体グローで予告する。
function updateConnections() {
  const R = "13px";
  const GAP = "3.5px";
  const JOIN = "-0.5px"; // わずかに重ねて継ぎ目を消す

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const t = grid[r][c];
      if (!t) continue;
      const k = keyOf(t);
      const same = (rr, cc) =>
        rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && grid[rr][cc] && keyOf(grid[rr][cc]) === k;
      const up = same(r - 1, c);
      const down = same(r + 1, c);
      const left = same(r, c - 1);
      const right = same(r, c + 1);

      const f = t.faceEl.style;
      f.top = up ? JOIN : GAP;
      f.bottom = down ? JOIN : GAP;
      f.left = left ? JOIN : GAP;
      f.right = right ? JOIN : GAP;
      f.borderTopLeftRadius = up || left ? "0px" : R;
      f.borderTopRightRadius = up || right ? "0px" : R;
      f.borderBottomLeftRadius = down || left ? "0px" : R;
      f.borderBottomRightRadius = down || right ? "0px" : R;
      // 下と接続しているタイルは底のベベル(立体の縁)を消す
      t.el.classList.toggle("conn-d", down);
      t.el.classList.remove("will-nova");
    }
  }

  const seen = new Set();
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const t = grid[r][c];
      if (!t || seen.has(t.id)) continue;
      const group = findGroup(t);
      for (const g of group) seen.add(g.id);
      if (group.length < 2) continue;
      const k = keyOf(t);
      const sum = group.reduce((s, g) => s + g.value, 0);
      const willAscend =
        (k !== "nova" && k !== "hole" && sum >= NOVA_AT) || (k === "nova" && sum >= HOLE_AT);
      if (willAscend) {
        for (const g of group) g.el.classList.add("will-nova");
      }
    }
  }
}

function hasMove() {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const t = grid[r][c];
      if (!t) continue;
      if (r < SIZE - 1 && grid[r + 1][c] && keyOf(grid[r + 1][c]) === keyOf(t)) return true;
      if (c < SIZE - 1 && grid[r][c + 1] && keyOf(grid[r][c + 1]) === keyOf(t)) return true;
    }
  }
  return false;
}

// ---------- サウンド(短いポップ音) ----------

let audioCtx = null;

function blip(value) {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const t = audioCtx.currentTime;
    const pitch = Math.min(Math.log2(value), 14);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(220 * 2 ** (pitch / 6), t);
    osc.frequency.exponentialRampToValueAtTime(330 * 2 ** (pitch / 6), t + 0.08);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  } catch (_) {
    /* 音が出せない環境では黙って続行 */
  }
}

// ---------- メインの操作 ----------

function onTap(tile) {
  if (busy || overlayEl.classList.contains("hidden") === false) return;
  if (grid[tile.r][tile.c] !== tile) return;

  const group = findGroup(tile);
  if (group.length < 2) {
    tile.el.classList.add("shake");
    setTimeout(() => tile.el.classList.remove("shake"), 320);
    return;
  }

  busy = true;
  const oldTier = tierOf(tile);
  const total = group.reduce((sum, t) => sum + t.value, 0);

  // 1) 仲間タイルがタップ位置へ吸い込まれる
  for (const t of group) {
    if (t === tile) {
      t.el.classList.add("target");
      continue;
    }
    grid[t.r][t.c] = null;
    t.el.classList.add("merging");
    t.r = tile.r;
    t.c = tile.c;
    setTilePos(t);
  }

  setTimeout(() => {
    // 2) 吸い込んだタイルを消して、本体が成長(色はそのまま)
    for (const t of group) {
      if (t !== tile) t.el.remove();
    }
    tile.value = total;
    refreshTileFace(tile);
    tile.el.classList.remove("will-nova");
    tile.el.classList.add("pop");
    if (tierOf(tile) !== oldTier) tile.el.classList.add("promoted");
    setTimeout(() => tile.el.classList.remove("pop", "target", "promoted"), 500);

    addScore(total, tile.r, tile.c);
    blip(total);

    if (!firstMergeDone) {
      firstMergeDone = true;
      hintEl.classList.add("faded");
    }

    // 3) 落下と補充
    setTimeout(() => {
      applyGravityAndRefill();
      setTimeout(() => {
        updateConnections();
        busy = false;
        if (!hasMove()) gameOver();
      }, 280);
    }, 60);
  }, 170);
}

function applyGravityAndRefill() {
  for (let c = 0; c < SIZE; c++) {
    const columnTiles = [];
    for (let r = SIZE - 1; r >= 0; r--) {
      if (grid[r][c]) columnTiles.push(grid[r][c]);
    }
    // 下詰めで再配置
    for (let i = 0; i < SIZE; i++) {
      const r = SIZE - 1 - i;
      if (i < columnTiles.length) {
        const t = columnTiles[i];
        grid[r][c] = t;
        if (t.r !== r) {
          t.r = r;
          setTilePos(t);
        }
      } else {
        grid[r][c] = null;
      }
    }
    // 空いた分を上から降らせる(新しい水素:H=1)
    const emptyCount = SIZE - columnTiles.length;
    for (let i = 0; i < emptyCount; i++) {
      const r = emptyCount - 1 - i;
      const tile = makeTile(1, randomColor(), r, c, r - emptyCount);
      grid[r][c] = tile;
    }
  }
}

function addScore(points, r, c) {
  score += points;
  scoreEl.textContent = fmt(score);
  if (score > best) {
    best = score;
    bestEl.textContent = fmt(best);
    localStorage.setItem(STORAGE_KEY, String(best));
  }

  const pop = document.createElement("div");
  pop.className = "score-pop";
  pop.textContent = "+" + fmt(points);
  pop.style.left = `${(c + 0.5) * 20}%`;
  pop.style.top = `${r * 20}%`;
  boardEl.appendChild(pop);
  setTimeout(() => pop.remove(), 800);
}

// ---------- 開始と終了 ----------

function gameOver() {
  finalScoreEl.textContent = fmt(score);
  const isNewBest = score >= best && score > 0;
  newBestEl.classList.toggle("hidden", !isNewBest);
  overlayEl.classList.remove("hidden");
}

function newGame() {
  busy = false;
  score = 0;
  firstMergeDone = false;
  scoreEl.textContent = "0";
  bestEl.textContent = fmt(best);
  overlayEl.classList.add("hidden");
  hintEl.classList.remove("faded");
  boardEl.querySelectorAll(".tile, .score-pop").forEach((el) => el.remove());

  do {
    grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    boardEl.querySelectorAll(".tile").forEach((el) => el.remove());
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        grid[r][c] = makeTile(1, randomColor(), r, c);
      }
    }
  } while (!hasMove());
  updateConnections();
}

document.getElementById("restart").addEventListener("click", newGame);
document.getElementById("reset").addEventListener("click", () => {
  if (!busy) newGame();
});

// 画面リサイズで文字サイズを取り直す
window.addEventListener("resize", () => {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const t = grid?.[r]?.[c];
      if (t) fontSizeFor(t.symEl.textContent, t.el);
    }
  }
});

newGame();
