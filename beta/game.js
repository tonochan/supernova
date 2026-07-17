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

const ELEMENT_NAMES = [
  "Hydrogen", "Helium", "Lithium", "Beryllium", "Boron", "Carbon", "Nitrogen", "Oxygen", "Fluorine", "Neon",
  "Sodium", "Magnesium", "Aluminium", "Silicon", "Phosphorus", "Sulfur", "Chlorine", "Argon", "Potassium", "Calcium",
  "Scandium", "Titanium", "Vanadium", "Chromium", "Manganese", "Iron", "Cobalt", "Nickel", "Copper", "Zinc",
  "Gallium", "Germanium", "Arsenic", "Selenium", "Bromine", "Krypton", "Rubidium", "Strontium", "Yttrium", "Zirconium",
  "Niobium", "Molybdenum", "Technetium", "Ruthenium", "Rhodium", "Palladium", "Silver", "Cadmium", "Indium", "Tin",
  "Antimony", "Tellurium", "Iodine", "Xenon", "Caesium", "Barium", "Lanthanum", "Cerium", "Praseodymium", "Neodymium",
  "Promethium", "Samarium", "Europium", "Gadolinium", "Terbium", "Dysprosium", "Holmium", "Erbium", "Thulium", "Ytterbium",
  "Lutetium", "Hafnium", "Tantalum", "Tungsten", "Rhenium", "Osmium", "Iridium", "Platinum", "Gold", "Mercury",
  "Thallium", "Lead", "Bismuth", "Polonium", "Astatine", "Radon", "Francium", "Radium", "Actinium", "Thorium",
  "Protactinium", "Uranium", "Neptunium", "Plutonium", "Americium", "Curium", "Berkelium", "Californium", "Einsteinium", "Fermium",
  "Mendelevium", "Nobelium", "Lawrencium", "Rutherfordium", "Dubnium", "Seaborgium", "Bohrium", "Hassium", "Meitnerium", "Darmstadtium",
  "Roentgenium", "Copernicium", "Nihonium", "Flerovium", "Moscovium", "Livermorium", "Tennessine", "Oganesson",
];

const ELEMENT_NAMES_JA = [
  "水素", "ヘリウム", "リチウム", "ベリリウム", "ホウ素", "炭素", "窒素", "酸素", "フッ素", "ネオン",
  "ナトリウム", "マグネシウム", "アルミニウム", "ケイ素", "リン", "硫黄", "塩素", "アルゴン", "カリウム", "カルシウム",
  "スカンジウム", "チタン", "バナジウム", "クロム", "マンガン", "鉄", "コバルト", "ニッケル", "銅", "亜鉛",
  "ガリウム", "ゲルマニウム", "ヒ素", "セレン", "臭素", "クリプトン", "ルビジウム", "ストロンチウム", "イットリウム", "ジルコニウム",
  "ニオブ", "モリブデン", "テクネチウム", "ルテニウム", "ロジウム", "パラジウム", "銀", "カドミウム", "インジウム", "スズ",
  "アンチモン", "テルル", "ヨウ素", "キセノン", "セシウム", "バリウム", "ランタン", "セリウム", "プラセオジム", "ネオジム",
  "プロメチウム", "サマリウム", "ユウロピウム", "ガドリニウム", "テルビウム", "ジスプロシウム", "ホルミウム", "エルビウム", "ツリウム", "イッテルビウム",
  "ルテチウム", "ハフニウム", "タンタル", "タングステン", "レニウム", "オスミウム", "イリジウム", "白金", "金", "水銀",
  "タリウム", "鉛", "ビスマス", "ポロニウム", "アスタチン", "ラドン", "フランシウム", "ラジウム", "アクチニウム", "トリウム",
  "プロトアクチニウム", "ウラン", "ネプツニウム", "プルトニウム", "アメリシウム", "キュリウム", "バークリウム", "カリホルニウム", "アインスタイニウム", "フェルミウム",
  "メンデレビウム", "ノーベリウム", "ローレンシウム", "ラザホージウム", "ドブニウム", "シーボーギウム", "ボーリウム", "ハッシウム", "マイトネリウム", "ダームスタチウム",
  "レントゲニウム", "コペルニシウム", "ニホニウム", "フレロビウム", "モスコビウム", "リバモリウム", "テネシン", "オガネソン",
];

// ---------- 言語(ブラウザ設定でデフォルト判定、切替はlocalStorageに保存) ----------

const LANG_KEY = "supernova-lang";
let lang =
  localStorage.getItem(LANG_KEY) ||
  ((navigator.language || "en").toLowerCase().startsWith("ja") ? "ja" : "en");

const STR = {
  en: {
    tagline: "Fuse stardust into the elements",
    play: "Play",
    howto: "How to play",
    scoreL: "SCORE",
    bestL: "BEST",
    hint: "Fuse same-color groups — reach Fe (26) to go supernova",
    restart: "Restart",
    overTitle: "No more fusions!",
    overScoreL: "SCORE",
    newBest: "✦ New best! ✦",
    newGameBtn: "New game",
    helpTitle: "How to play",
    hs1: "Tap a group of <strong>2+ touching tiles of the same color</strong> to fuse them. Atomic numbers add up.",
    hs2: "Numbers don't need to match — <strong>color is all that matters</strong>, and fused tiles keep it.",
    hs3: "Reach <strong>Fe (26)</strong> and the tile goes <strong>supernova</strong> ✦. Novas only fuse with other novas.",
    hs4: "Push past <strong>Og (118)</strong> and novas collapse into a <strong>black hole</strong>. Holes devour each other, too.",
    hs5: "When nothing can fuse, the sky is full — game over. Can you light up all <strong>118 elements</strong> on the periodic table?",
    gotIt: "Got it",
    backTitle: "Back to title?",
    backText: "Your current game will be lost.",
    backYes: "Back to title",
    backNo: "Cancel",
    ptLabel: " / 118 elements",
    ptHole: "· ● black hole",
    holeName: "black hole",
    langBtn: "日本語",
    toastNew: (z, s, n) => `✦ New element! ${z} ${s} — ${n}`,
    toastHole: "✦ You made a BLACK HOLE! ✦",
  },
  ja: {
    tagline: "星屑をあつめて元素をつくろう",
    play: "あそぶ",
    howto: "あそびかた",
    scoreL: "スコア",
    bestL: "ベスト",
    hint: "同じ色をつなげて融合 — Fe(26)で超新星に",
    restart: "はじめから",
    overTitle: "もう融合できない!",
    overScoreL: "スコア",
    newBest: "✦ ベスト記録こうしん! ✦",
    newGameBtn: "もういちど",
    helpTitle: "あそびかた",
    hs1: "<strong>同じ色のタイルが2枚以上</strong>つながっていたら、タップで融合。原子番号が足し算される。",
    hs2: "数字はちがってもOK — <strong>大事なのは色</strong>。融合しても色は変わらない。",
    hs3: "<strong>Fe(26)</strong>に届くと<strong>超新星</strong>✦に。ノヴァはノヴァ同士でしか融合できない。",
    hs4: "<strong>Og(118)</strong>を超えると<strong>ブラックホール</strong>に崩壊。ブラックホール同士も融合できる。",
    hs5: "どこも融合できなくなったらゲームオーバー。周期表の<strong>118元素</strong>をすべて光らせよう!",
    gotIt: "わかった",
    backTitle: "ホームにもどる?",
    backText: "いまのゲームは終了します。",
    backYes: "もどる",
    backNo: "キャンセル",
    ptLabel: " / 118 元素",
    ptHole: "· ● ブラックホール",
    holeName: "ブラックホール",
    langBtn: "English",
    toastNew: (z, s, n) => `✦ 新元素はっけん! ${z} ${s} — ${n}`,
    toastHole: "✦ ブラックホール誕生! ✦",
  },
};

function elementName(z) {
  return (lang === "ja" ? ELEMENT_NAMES_JA : ELEMENT_NAMES)[z - 1];
}

// 各色の「軽い→重い」カラーランプ。育つほど深く濃い色になる
const COLOR_RAMP = {
  red: [[248, 172, 156], [222, 74, 58]],
  yellow: [[248, 212, 128], [230, 156, 26]],
  green: [[128, 228, 184], [14, 176, 118]],
  blue: [[150, 184, 248], [56, 100, 224]],
};

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
let maxTile = 1; // このゲームで作った最大の元素(降ってくる元素の幅に影響)

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

// 星屑の成長度 0..1(H=0、Fe直前=1)
function growthT(tile) {
  return Math.min((tile.value - 1) / (NOVA_AT - 1), 1);
}

// 育つほど色が深まり、中心に「熱い核」の光が生まれる
function bgFor(tile) {
  const t = growthT(tile);
  const [lo, hi] = COLOR_RAMP[tile.color];
  const mix = lo.map((v, i) => Math.round(v + (hi[i] - v) * t));
  const coreA = (0.12 + 0.68 * t).toFixed(2);
  const coreR = Math.round(16 + 36 * t);
  return `radial-gradient(circle at 50% 36%, rgba(255,255,255,${coreA}) 0%, rgba(255,255,255,0) ${coreR}%), rgb(${mix.join(",")})`;
}

function sizeTile(tile) {
  // 盤面幅に対する相対サイズ。桁数で縮め、成長度で育てる
  const base = boardEl.clientWidth / SIZE;
  const text = tile.symEl.textContent;
  let scale = text.length <= 2 ? 0.28 : text.length <= 3 ? 0.24 : 0.21;
  if (tile.value < HOLE_AT) scale *= 1 + 0.22 * growthT(tile);
  tile.el.style.setProperty("--fs", `${Math.round(base * scale)}px`);
  tile.el.style.setProperty("--fs-mass", `${Math.round(base * 0.13)}px`);
  const name = tile.nameEl.textContent;
  const longName = lang === "ja" ? name.length > 5 : name.length > 9;
  tile.el.style.setProperty("--fs-name", `${Math.round(base * (longName ? 0.085 : 0.105))}px`);
}

function setTilePos(tile) {
  tile.el.style.transform = `translate(${tile.c * 100}%, ${tile.r * 100}%)`;
}

function refreshTileFace(tile) {
  tile.el.dataset.color = keyOf(tile);
  const face = tile.faceEl.style;
  if (tile.value >= HOLE_AT) {
    // 周期表の外側:質量だけのブラックホール
    tile.symEl.textContent = fmt(tile.value);
    tile.massEl.textContent = "";
    tile.nameEl.textContent = STR[lang].holeName;
    face.background = "";
    face.color = "";
    face.textShadow = "";
  } else {
    tile.symEl.textContent = ELEMENTS[tile.value - 1];
    tile.massEl.textContent = String(tile.value);
    tile.nameEl.textContent = elementName(tile.value);
    if (tierOf(tile) === "nova") {
      face.background = "";
      face.color = "";
      face.textShadow = "";
      // 次の段階(ブラックホール=118超え)までの進み具合
      face.setProperty("--ring-p", Math.min(tile.value / 118, 1));
      face.setProperty("--ring-c", "rgba(201, 147, 31, 0.9)");
      face.setProperty("--ring-t", "rgba(28, 35, 64, 0.14)");
    } else {
      const t = growthT(tile);
      face.background = bgFor(tile);
      face.color = t > 0.55 ? "#fff" : "";
      face.textShadow = t > 0.55 ? "0 1px 6px rgba(0,0,0,0.35)" : "";
      // 超新星(26)までの進み具合
      face.setProperty("--ring-p", Math.min(tile.value / NOVA_AT, 1));
      face.setProperty("--ring-c", t > 0.55 ? "rgba(255,255,255,0.9)" : "rgba(28, 35, 64, 0.5)");
      face.setProperty("--ring-t", t > 0.55 ? "rgba(255,255,255,0.28)" : "rgba(0, 0, 0, 0.13)");
    }
  }
  sizeTile(tile);
}

// ---------- タイル生成 ----------

function makeTile(value, color, r, c, spawnFromRow = null) {
  const el = document.createElement("div");
  el.className = "tile";
  const face = document.createElement("div");
  face.className = "face";
  const mass = document.createElement("span");
  mass.className = "mass";
  const core = document.createElement("div");
  core.className = "core";
  const ring = document.createElement("span");
  ring.className = "ring";
  const sym = document.createElement("span");
  sym.className = "sym";
  const name = document.createElement("span");
  name.className = "name";
  core.appendChild(ring);
  core.appendChild(sym);
  face.appendChild(mass);
  face.appendChild(core);
  face.appendChild(name);
  el.appendChild(face);

  const tile = { id: nextId++, value, color, r, c, el, symEl: sym, massEl: mass, nameEl: name, faceEl: face };
  refreshTileFace(tile);
  noteDiscovery(value, true); // 盤面に出現した元素も周期表に灯る(トーストなし)

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
  // 序盤は3色。初めて超新星を作ったら4色目(blue)が降りはじめる
  const count = maxTile >= NOVA_AT ? 4 : 3;
  return COLORS[Math.floor(Math.random() * count)];
}

// 降ってくる元素。基本は軽い元素ほど多く、ゲームが進むほど上限が上がる
function spawnValue() {
  let cap = 4; // H, He, Li, Be
  if (maxTile >= NOVA_AT) cap = 6; // 超新星を作ったら C まで
  if (maxTile >= 60) cap = 8; // さらに育ったら O まで
  if (maxTile >= HOLE_AT) cap = 10; // ブラックホール後は Ne まで
  const weights = [];
  let total = 0;
  for (let v = 1; v <= cap; v++) {
    const w = 1 / v;
    weights.push(w);
    total += w;
  }
  let r = Math.random() * total;
  for (let v = 1; v <= cap; v++) {
    r -= weights[v - 1];
    if (r <= 0) return v;
  }
  return 1;
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

// ---------- 元素の発見コレクション ----------

const FOUND_KEY = "supernova-found";
// 0 はブラックホールの印。H(1)は最初から知っている
const found = new Set(JSON.parse(localStorage.getItem(FOUND_KEY) || "[1]"));

const toastEl = document.getElementById("toast");
let toastTimer = null;

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2400);
}

function noteDiscovery(value, silent = false) {
  const id = value >= HOLE_AT ? 0 : value;
  if (found.has(id)) return;
  found.add(id);
  localStorage.setItem(FOUND_KEY, JSON.stringify([...found]));
  refreshPtable();
  if (silent) return;
  if (id === 0) {
    toast(STR[lang].toastHole);
  } else {
    toast(STR[lang].toastNew(value, ELEMENTS[value - 1], elementName(value)));
  }
}

// ---------- ミニ周期表 ----------

// 標準的な18列レイアウトでの位置(ランタノイド/アクチノイドは下の段)
function ptPos(z) {
  if (z === 1) return [1, 1];
  if (z === 2) return [1, 18];
  if (z <= 4) return [2, z - 2];
  if (z <= 10) return [2, z + 8];
  if (z <= 12) return [3, z - 10];
  if (z <= 18) return [3, z];
  if (z <= 36) return [4, z - 18];
  if (z <= 54) return [5, z - 36];
  if (z <= 56) return [6, z - 54];
  if (z <= 71) return [9, z - 57 + 3]; // ランタノイド(8行目はスペーサー)
  if (z <= 86) return [6, z - 68];
  if (z <= 88) return [7, z - 86];
  if (z <= 103) return [10, z - 89 + 3]; // アクチノイド
  return [7, z - 100];
}

const ptableEl = document.getElementById("ptable");
const ptCountEl = document.getElementById("pt-count");
const ptHoleEl = document.getElementById("pt-hole");
const ptCells = new Map();

function buildPtable() {
  for (let z = 1; z <= 118; z++) {
    const [row, col] = ptPos(z);
    const cell = document.createElement("div");
    cell.className = "pt-cell";
    cell.style.gridRow = row;
    cell.style.gridColumn = col;
    cell.title = `${z} ${ELEMENTS[z - 1]} — ${elementName(z)}`;
    ptableEl.appendChild(cell);
    ptCells.set(z, cell);
  }
}

function refreshPtable() {
  let n = 0;
  for (let z = 1; z <= 118; z++) {
    const on = found.has(z);
    if (on) n++;
    ptCells.get(z).classList.toggle("on", on);
  }
  ptCountEl.textContent = n;
  ptHoleEl.classList.toggle("hidden", !found.has(0));
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
    maxTile = Math.max(maxTile, total);
    refreshTileFace(tile);
    tile.el.classList.remove("will-nova");
    tile.el.classList.add("pop");
    if (tierOf(tile) !== oldTier) tile.el.classList.add("promoted");
    setTimeout(() => tile.el.classList.remove("pop", "target", "promoted"), 500);

    addScore(total, tile.r, tile.c);
    noteDiscovery(total);
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
      const tile = makeTile(spawnValue(), randomColor(), r, c, r - emptyCount);
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
  maxTile = 1;
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
        grid[r][c] = makeTile(spawnValue(), randomColor(), r, c);
      }
    }
  } while (!hasMove());
  updateConnections();
}

document.getElementById("restart").addEventListener("click", newGame);

// ---------- タイトル画面とヘルプ ----------

const titleScreen = document.getElementById("title-screen");
const helpModal = document.getElementById("help-modal");

document.getElementById("play-btn").addEventListener("click", () => {
  titleScreen.classList.add("gone");
});
document.getElementById("howto-btn").addEventListener("click", () => {
  helpModal.classList.remove("hidden");
});
document.getElementById("help-btn").addEventListener("click", () => {
  helpModal.classList.remove("hidden");
});
document.getElementById("help-close").addEventListener("click", () => {
  helpModal.classList.add("hidden");
});
// カードの外側をタップしても閉じる
helpModal.addEventListener("click", (e) => {
  if (e.target === helpModal) helpModal.classList.add("hidden");
});

// 戻るボタン → 確認モーダル → ホーム(タイトル)へ。ゲームはリセットされる
const backModal = document.getElementById("back-modal");

document.getElementById("back-btn").addEventListener("click", () => {
  if (!busy) backModal.classList.remove("hidden");
});
document.getElementById("back-no").addEventListener("click", () => {
  backModal.classList.add("hidden");
});
backModal.addEventListener("click", (e) => {
  if (e.target === backModal) backModal.classList.add("hidden");
});
document.getElementById("back-yes").addEventListener("click", () => {
  backModal.classList.add("hidden");
  newGame();
  titleScreen.classList.remove("gone");
});

// ---------- 言語の適用と切替 ----------

function applyLang() {
  const s = STR[lang];
  document.documentElement.lang = lang;
  const setText = (id, text) => (document.getElementById(id).textContent = text);
  setText("tagline", s.tagline);
  setText("play-btn", s.play);
  setText("howto-btn", s.howto);
  setText("score-label", s.scoreL);
  setText("best-label", s.bestL);
  setText("hint", s.hint);
  setText("over-title", s.overTitle);
  setText("final-score-label", s.overScoreL);
  setText("new-best", s.newBest);
  setText("restart", s.newGameBtn);
  setText("help-title", s.helpTitle);
  setText("help-close", s.gotIt);
  setText("back-title", s.backTitle);
  setText("back-text", s.backText);
  setText("back-yes", s.backYes);
  setText("back-no", s.backNo);
  setText("pt-label", s.ptLabel);
  setText("pt-hole", s.ptHole);
  setText("lang-btn", s.langBtn);
  setText("lang-btn-title", s.langBtn);
  for (const id of ["hs1", "hs2", "hs3", "hs4", "hs5"]) {
    document.getElementById(id).innerHTML = s[id];
  }
  // タイル上の元素名と周期表のツールチップも切り替える
  if (grid) {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (grid[r][c]) refreshTileFace(grid[r][c]);
      }
    }
  }
  for (const [z, cell] of ptCells) {
    cell.title = `${z} ${ELEMENTS[z - 1]} — ${elementName(z)}`;
  }
}

function toggleLang() {
  lang = lang === "ja" ? "en" : "ja";
  localStorage.setItem(LANG_KEY, lang);
  applyLang();
}

document.getElementById("lang-btn").addEventListener("click", toggleLang);
document.getElementById("lang-btn-title").addEventListener("click", toggleLang);

// 画面リサイズで文字サイズを取り直す
window.addEventListener("resize", () => {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const t = grid?.[r]?.[c];
      if (t) sizeTile(t);
    }
  }
});

buildPtable();
refreshPtable();
applyLang();
newGame();
