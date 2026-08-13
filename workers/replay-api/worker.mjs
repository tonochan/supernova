"use strict";

const API_VERSION = 1;
const KEY_PREFIX = "replay:";
const MAX_PAYLOAD_CHARS = 262144;
const ID_BYTES = 12;
const ID_RE = /^[A-Za-z0-9_-]{16}$/;
const PAYLOAD_RE = /^snr1[A-Za-z0-9_-]+$/;
const REPLAY_SHARE_PREFIX = "snr1";
const REPLAY_SHARE_LEGACY_PREFIX = "snr1.";
const REPLAY_SERVER_PREFIX = "srv1";
const REPLAY_QUERY_KEY = "replay";
const DEFAULT_CANONICAL_ORIGIN = "https://supernova.tonochan.jp";
const DEFAULT_GAME_BASE_URL = `${DEFAULT_CANONICAL_ORIGIN}/`;
const LEGACY_WORKER_HOST = "supernova-replay-api.tonosaki-shuntaro.workers.dev";
const SIZE = 5;
const RULES_VERSION = 1;
const NOVA_AT = 26;
const HOLE_AT = 119;
const COLORS = ["red", "yellow", "green", "blue"];
const COLOR_RAMP = {
  red: [[248, 172, 156], [222, 74, 58]],
  yellow: [[248, 212, 128], [230, 156, 26]],
  green: [[128, 228, 184], [14, 176, 118]],
  blue: [[150, 184, 248], [56, 100, 224]],
};
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
const DEFAULT_ALLOWED_ORIGINS = [
  DEFAULT_CANONICAL_ORIGIN,
  "https://tonochan.github.io",
  "http://localhost:8420",
  "http://127.0.0.1:8420",
];

function allowedOrigins(env) {
  const value = typeof env.ALLOWED_ORIGINS === "string" ? env.ALLOWED_ORIGINS : "";
  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.length ? origins : DEFAULT_ALLOWED_ORIGINS;
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const headers = {
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && allowedOrigins(env).includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function jsonResponse(request, env, body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(request, env),
      ...extraHeaders,
    },
  });
}

function htmlResponse(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex",
      ...extraHeaders,
    },
  });
}

function svgResponse(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "X-Robots-Tag": "noindex",
      ...extraHeaders,
    },
  });
}

function pngResponse(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "image/png",
      "X-Robots-Tag": "noindex",
      ...extraHeaders,
    },
  });
}

function errorResponse(request, env, status, code) {
  return jsonResponse(request, env, { error: code }, status);
}

function isAllowedRequestOrigin(request, env) {
  const origin = request.headers.get("Origin");
  return !origin || allowedOrigins(env).includes(origin);
}

function maxPayloadChars(env) {
  const configured = Number(env.MAX_PAYLOAD_CHARS);
  return Number.isInteger(configured) && configured > 0 ? configured : MAX_PAYLOAD_CHARS;
}

function base64UrlToBytes(text) {
  const normalized = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function assertReplayPayload(payload, env) {
  if (typeof payload !== "string" || !PAYLOAD_RE.test(payload)) {
    throw new Error("invalid_payload");
  }
  if (payload.length > maxPayloadChars(env)) {
    throw new Error("payload_too_large");
  }

  const bytes = base64UrlToBytes(payload.slice(REPLAY_SHARE_PREFIX.length));
  if (
    bytes.length < 4 ||
    bytes[0] !== 83 ||
    bytes[1] !== 78 ||
    bytes[2] !== 82 ||
    bytes[3] !== 1
  ) {
    throw new Error("invalid_payload");
  }
}

function makeByteReader(bytes) {
  let i = 0;
  return {
    readByte() {
      if (i >= bytes.length) throw new Error("Shared replay ended early");
      return bytes[i++];
    },
    readVarUint() {
      let value = 0;
      let multiplier = 1;
      while (true) {
        const byte = this.readByte();
        value += (byte & 127) * multiplier;
        if (value > Number.MAX_SAFE_INTEGER) throw new Error("Shared replay number is too large");
        if ((byte & 128) === 0) return value;
        multiplier *= 128;
      }
    },
    done() {
      return i === bytes.length;
    },
  };
}

function sharedReplayBody(payload) {
  if (payload.startsWith(REPLAY_SHARE_LEGACY_PREFIX)) {
    return payload.slice(REPLAY_SHARE_LEGACY_PREFIX.length);
  }
  if (payload.startsWith(REPLAY_SHARE_PREFIX)) {
    return payload.slice(REPLAY_SHARE_PREFIX.length);
  }
  throw new Error("Invalid shared replay");
}

function cleanReplayCell(cell) {
  const value = Number(cell?.value);
  const color = cell?.color;
  if (!Number.isInteger(value) || value < 1 || !COLORS.includes(color)) {
    throw new Error("Invalid replay cell");
  }
  return { value, color };
}

function readSharedCell(reader) {
  const value = reader.readVarUint();
  const color = COLORS[reader.readByte()];
  if (!color) throw new Error("Invalid shared replay color");
  return cleanReplayCell({ value, color });
}

function cloneBoard(board) {
  return board.map((row) => row.map((cell) => (cell ? { value: cell.value, color: cell.color } : null)));
}

function keyOfReplayCell(cell) {
  if (cell.value >= HOLE_AT) return "hole";
  if (cell.value >= NOVA_AT) return "nova";
  return cell.color;
}

function neighbors(r, c) {
  const out = [];
  if (r > 0) out.push([r - 1, c]);
  if (r < SIZE - 1) out.push([r + 1, c]);
  if (c > 0) out.push([r, c - 1]);
  if (c < SIZE - 1) out.push([r, c + 1]);
  return out;
}

function findReplayGroup(board, r, c) {
  const start = board[r]?.[c];
  if (!start) return [];
  const k = keyOfReplayCell(start);
  const group = [];
  const seen = new Set([`${r},${c}`]);
  const stack = [[r, c]];
  while (stack.length) {
    const [cr, cc] = stack.pop();
    group.push([cr, cc]);
    for (const [nr, nc] of neighbors(cr, cc)) {
      const n = board[nr][nc];
      const id = `${nr},${nc}`;
      if (n && !seen.has(id) && keyOfReplayCell(n) === k) {
        seen.add(id);
        stack.push([nr, nc]);
      }
    }
  }
  return group;
}

function applyReplayMoveSkeleton(board, tap) {
  const r = Number(tap?.r);
  const c = Number(tap?.c);
  if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r >= SIZE || c < 0 || c >= SIZE) {
    throw new Error("Invalid replay tap");
  }

  const target = board[r][c];
  const group = findReplayGroup(board, r, c);
  if (!target || group.length < 2) throw new Error("Replay move cannot fuse");

  const gain = group.reduce((sum, [gr, gc]) => sum + board[gr][gc].value, 0);
  for (const [gr, gc] of group) board[gr][gc] = null;
  board[r][c] = { value: gain, color: target.color };

  const slots = [];
  for (let col = 0; col < SIZE; col++) {
    const columnTiles = [];
    for (let row = SIZE - 1; row >= 0; row--) {
      if (board[row][col]) columnTiles.push(board[row][col]);
    }
    for (let i = 0; i < SIZE; i++) {
      const row = SIZE - 1 - i;
      if (i < columnTiles.length) {
        board[row][col] = columnTiles[i];
      } else {
        board[row][col] = null;
        slots.push({ r: row, c: col });
      }
    }
  }
  return { gain, slots };
}

function fillReplaySpawnSlots(board, slots, cells) {
  if (slots.length !== cells.length) throw new Error("Replay spawn count mismatch");
  slots.forEach((slot, i) => {
    board[slot.r][slot.c] = cleanReplayCell(cells[i]);
  });
}

function decodeReplayPayload(payload) {
  const bytes = base64UrlToBytes(sharedReplayBody(payload));
  const reader = makeByteReader(bytes);
  if (reader.readByte() !== 83 || reader.readByte() !== 78 || reader.readByte() !== 82) {
    throw new Error("Invalid shared replay header");
  }
  if (reader.readByte() !== 1) throw new Error("Unsupported shared replay format");
  if (reader.readVarUint() !== RULES_VERSION) throw new Error("Unsupported shared replay rules");
  if (reader.readByte() !== SIZE) throw new Error("Unsupported shared replay board");

  const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) board[r][c] = readSharedCell(reader);
  }

  let score = 0;
  let maxTile = 1;
  const moveCount = reader.readVarUint();
  for (let i = 0; i < moveCount; i++) {
    const tapIndex = reader.readByte();
    if (tapIndex >= SIZE * SIZE) throw new Error("Invalid shared replay tap");
    const tap = { r: Math.floor(tapIndex / SIZE), c: tapIndex % SIZE };
    const { gain, slots } = applyReplayMoveSkeleton(board, tap);
    const spawnCount = reader.readVarUint();
    if (spawnCount !== slots.length) throw new Error("Invalid shared replay spawn count");
    const spawns = [];
    for (let s = 0; s < spawnCount; s++) spawns.push(readSharedCell(reader));
    fillReplaySpawnSlots(board, slots, spawns);
    score += gain;
    maxTile = Math.max(maxTile, gain);
  }
  if (!reader.done()) throw new Error("Shared replay has trailing data");

  return { board: cloneBoard(board), score, maxTile, moves: moveCount };
}

function cleanSummary(summary) {
  if (!summary || typeof summary !== "object") return {};
  const clean = {};
  for (const key of ["score", "maxTile", "moves"]) {
    const value = Number(summary[key]);
    if (Number.isSafeInteger(value) && value >= 0) clean[key] = value;
  }
  if (typeof summary.appVersion === "string") clean.appVersion = summary.appVersion.slice(0, 64);
  return clean;
}

async function replayIdForPayload(payload) {
  const encoded = new TextEncoder().encode(payload);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoded));
  return bytesToBase64Url(digest.slice(0, ID_BYTES));
}

async function replayRecord(env, id, cacheTtl = 60) {
  return env.REPLAYS.get(`${KEY_PREFIX}${id}`, {
    type: "json",
    cacheTtl,
  });
}

function formatNumber(value) {
  const n = Math.max(0, Math.floor(Number(value) || 0));
  return n.toLocaleString("en-US");
}

function maxTileLabel(value) {
  const n = Math.max(1, Math.floor(Number(value) || 1));
  if (n >= HOLE_AT) return `Black hole (${formatNumber(n)})`;
  if (n <= ELEMENTS.length) return `${ELEMENTS[n - 1]} (${formatNumber(n)})`;
  return formatNumber(n);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function escapeXml(value) {
  return escapeHtml(value);
}

function normalizeGameBaseUrl(value) {
  try {
    const url = new URL(value || DEFAULT_GAME_BASE_URL);
    url.search = "";
    url.hash = "";
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    return url.toString();
  } catch (_) {
    return DEFAULT_GAME_BASE_URL;
  }
}

function gameBaseUrl(env) {
  const configured = typeof env.GAME_BASE_URL === "string" ? env.GAME_BASE_URL.trim() : "";
  return normalizeGameBaseUrl(configured || DEFAULT_GAME_BASE_URL);
}

function canonicalOrigin(env) {
  try {
    const configured = typeof env.CANONICAL_ORIGIN === "string" ? env.CANONICAL_ORIGIN.trim() : "";
    return new URL(configured || DEFAULT_CANONICAL_ORIGIN).origin;
  } catch (_) {
    return DEFAULT_CANONICAL_ORIGIN;
  }
}

function legacyWorkerRedirect(request, env) {
  const url = new URL(request.url);
  if (url.hostname !== LEGACY_WORKER_HOST || url.pathname.startsWith("/v1/")) return null;

  const target = new URL(request.url);
  const canonical = new URL(canonicalOrigin(env));
  target.protocol = canonical.protocol;
  target.hostname = canonical.hostname;
  target.port = canonical.port;
  return Response.redirect(target.toString(), 308);
}

function replayGameUrl(env, id) {
  const url = new URL(gameBaseUrl(env));
  url.searchParams.set(REPLAY_QUERY_KEY, `${REPLAY_SERVER_PREFIX}${id}`);
  return url.toString();
}

function replayModel(record, decodeBoard = false) {
  const summary = cleanSummary(record?.summary);
  let decoded = null;
  let decodeFailed = false;

  if (decodeBoard && typeof record?.payload === "string") {
    try {
      decoded = decodeReplayPayload(record.payload);
    } catch (_) {
      decodeFailed = true;
    }
  }

  const score = Number.isSafeInteger(summary.score) ? summary.score : decoded?.score ?? 0;
  const maxTile =
    Number.isSafeInteger(summary.maxTile) && summary.maxTile > 0 ? summary.maxTile : decoded?.maxTile ?? 1;
  const moves = Number.isSafeInteger(summary.moves) ? summary.moves : decoded?.moves ?? 0;

  return {
    score,
    maxTile,
    moves,
    appVersion: summary.appVersion || null,
    board: decoded?.board ?? null,
    decodeFailed,
  };
}

function replayTitle(model) {
  return `SUPERNOVA Replay - ${formatNumber(model.score)} pts`;
}

function replayDescription(model) {
  return `Max ${maxTileLabel(model.maxTile)} / ${formatNumber(model.moves)} moves`;
}

function canonicalAbsoluteUrl(env, path) {
  return new URL(path, canonicalOrigin(env)).toString();
}

function replayLandingHtml(model, urls) {
  const title = replayTitle(model);
  const description = replayDescription(model);
  const imageType = urls.imageType || "image/png";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="canonical" href="${escapeHtml(urls.shareUrl)}">
<meta name="description" content="${escapeHtml(description)}">
<meta property="og:site_name" content="SUPERNOVA">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${escapeHtml(urls.shareUrl)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(urls.imageUrl)}">
<meta property="og:image:secure_url" content="${escapeHtml(urls.imageUrl)}">
<meta property="og:image:type" content="${escapeHtml(imageType)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${escapeHtml(description)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(urls.imageUrl)}">
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#101524;color:#f6f7fb;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{width:min(520px,calc(100% - 32px));text-align:center}
h1{margin:0 0 12px;font-size:32px}
p{margin:0 0 24px;color:#cfd6e8}
a{color:#fff;background:#246bfe;border-radius:8px;display:inline-block;padding:12px 18px;text-decoration:none;font-weight:700}
</style>
<script>window.location.replace(${JSON.stringify(urls.gameUrl)});</script>
</head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(description)}</p>
<a href="${escapeHtml(urls.gameUrl)}">Open replay</a>
</main>
</body>
</html>`;
}

function replayNotFoundHtml(id) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SUPERNOVA Replay not found</title>
</head>
<body>
<main>
<h1>Replay not found</h1>
<p>${escapeHtml(id)}</p>
</main>
</body>
</html>`;
}

function mixRgb(lo, hi, t) {
  return `rgb(${lo.map((v, i) => Math.round(v + (hi[i] - v) * t)).join(",")})`;
}

function growthT(cell) {
  return Math.min((cell.value - 1) / (NOVA_AT - 1), 1);
}

function tileFill(cell) {
  if (!cell) return "#1a2038";
  if (cell.value >= HOLE_AT) return "#160d2b";
  if (cell.value >= NOVA_AT) return "#fff3d6";
  const [lo, hi] = COLOR_RAMP[cell.color] || COLOR_RAMP.red;
  return mixRgb(lo, hi, growthT(cell));
}

function tileTextColor(cell) {
  if (!cell) return "#667091";
  if (cell.value >= HOLE_AT) return "#fff7ff";
  if (cell.value >= NOVA_AT) return "#302545";
  return growthT(cell) > 0.55 ? "#ffffff" : "#20243a";
}

function tileStrokeColor(cell) {
  if (!cell) return "#28304d";
  if (cell.value >= HOLE_AT) return "#9a7cf8";
  if (cell.value >= NOVA_AT) return "#d79b29";
  return "rgba(255,255,255,0.42)";
}

function tileGlow(cell) {
  if (!cell || cell.value >= HOLE_AT || cell.value >= NOVA_AT) {
    return { opacity: 0.18, radius: 32, color: "#ffffff" };
  }
  const t = growthT(cell);
  return {
    opacity: 0.12 + 0.68 * t,
    radius: 16 + 36 * t,
    color: "#ffffff",
  };
}

function tileRing(cell) {
  if (!cell || cell.value >= HOLE_AT) return "";
  const radius = 25;
  const circumference = 2 * Math.PI * radius;
  const progress =
    cell.value >= NOVA_AT ? Math.min(cell.value / 118, 1) : Math.min(cell.value / NOVA_AT, 1);
  const dash = (circumference * progress).toFixed(2);
  const gap = (circumference - circumference * progress).toFixed(2);
  const ringColor = cell.value >= NOVA_AT ? "rgba(201,147,31,0.86)" : "rgba(255,255,255,0.82)";
  const trackColor = cell.value >= NOVA_AT ? "rgba(28,35,64,0.12)" : "rgba(255,255,255,0.2)";
  return `<circle cx="42" cy="42" r="${radius}" fill="none" stroke="${trackColor}" stroke-width="3.5"/>
<circle cx="42" cy="42" r="${radius}" fill="none" stroke="${ringColor}" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="${dash} ${gap}" transform="rotate(-90 42 42)"/>`;
}

function tileSymbol(cell) {
  if (!cell) return "";
  if (cell.value >= HOLE_AT) return formatNumber(cell.value);
  return ELEMENTS[cell.value - 1] || formatNumber(cell.value);
}

function renderSvgTile(cell, r, c) {
  const boardX = 665;
  const boardY = 82;
  const cellSize = 84;
  const gap = 12;
  const x = boardX + c * (cellSize + gap);
  const y = boardY + r * (cellSize + gap);
  const symbol = tileSymbol(cell);
  const symbolSize = symbol.length <= 2 ? 39 : symbol.length <= 4 ? 30 : 22;
  const mass = cell && cell.value < HOLE_AT ? formatNumber(cell.value) : "";
  const fill = tileFill(cell);
  const textColor = tileTextColor(cell);
  const stroke = tileStrokeColor(cell);
  const glow = tileGlow(cell);
  const ring = tileRing(cell);
  const textShadow = cell?.value >= HOLE_AT ? "filter=\"url(#textGlow)\"" : "";
  return `<g transform="translate(${x} ${y})">
<g filter="url(#tileShadow)">
<rect width="${cellSize}" height="${cellSize}" rx="13" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>
<circle cx="42" cy="31" r="${glow.radius.toFixed(1)}" fill="${glow.color}" opacity="${glow.opacity.toFixed(2)}"/>
<rect x="4" y="4" width="76" height="34" rx="10" fill="#ffffff" opacity="${cell?.value >= HOLE_AT ? "0.05" : "0.18"}"/>
<rect x="4" y="64" width="76" height="16" rx="8" fill="#000000" opacity="${cell?.value >= HOLE_AT ? "0.22" : "0.14"}"/>
</g>
${ring}
${mass ? `<text x="12" y="21" fill="${textColor}" opacity="0.72" font-size="16" font-weight="700">${escapeXml(mass)}</text>` : ""}
<text x="${cellSize / 2}" y="${cellSize / 2 + symbolSize * 0.33}" text-anchor="middle" fill="${textColor}" font-size="${symbolSize}" font-weight="800" ${textShadow}>${escapeXml(symbol)}</text>
</g>`;
}

function renderBoardTiles(board) {
  if (!board) {
    return Array.from({ length: SIZE * SIZE }, (_, i) => renderSvgTile(null, Math.floor(i / SIZE), i % SIZE)).join("");
  }
  return board.flatMap((row, r) => row.map((cell, c) => renderSvgTile(cell, r, c))).join("");
}

function replayOgpSvg(model) {
  const title = replayTitle(model);
  const description = replayDescription(model);
  const score = formatNumber(model.score);
  const scoreSize = score.length > 12 ? 58 : score.length > 9 ? 70 : 86;
  const boardNote = model.board ? "Final board" : "Replay summary";
  const decodeNote = model.decodeFailed ? "Board preview unavailable" : boardNote;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${escapeXml(description)}">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#101524"/>
<stop offset="1" stop-color="#222842"/>
</linearGradient>
<filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
<feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#03050c" flood-opacity="0.35"/>
</filter>
<filter id="tileShadow" x="-20%" y="-20%" width="140%" height="145%">
<feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#02040c" flood-opacity="0.45"/>
</filter>
<filter id="textGlow" x="-30%" y="-30%" width="160%" height="160%">
<feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#a987ff" flood-opacity="0.75"/>
</filter>
</defs>
<rect width="1200" height="630" fill="url(#bg)"/>
<rect x="48" y="48" width="1104" height="534" rx="28" fill="#151b2f" stroke="rgba(255,255,255,0.16)" filter="url(#shadow)"/>
<text x="78" y="116" fill="#f7f8ff" font-size="48" font-weight="850" font-family="Fredoka, system-ui, sans-serif">SUPERNOVA</text>
<text x="82" y="172" fill="#aeb9d8" font-size="29" font-weight="700" font-family="system-ui, sans-serif">Replay</text>
<text x="78" y="292" fill="#ffffff" font-size="${scoreSize}" font-weight="900" font-family="Fredoka, system-ui, sans-serif">${escapeXml(score)}</text>
<text x="84" y="342" fill="#aeb9d8" font-size="30" font-weight="700" font-family="system-ui, sans-serif">points</text>
<rect x="78" y="394" width="468" height="1" fill="rgba(255,255,255,0.16)"/>
<text x="84" y="442" fill="#f7f1dc" font-size="31" font-weight="800" font-family="system-ui, sans-serif">Max ${escapeXml(maxTileLabel(model.maxTile))}</text>
<text x="84" y="493" fill="#dce3f8" font-size="29" font-weight="750" font-family="system-ui, sans-serif">${escapeXml(formatNumber(model.moves))} moves</text>
<text x="84" y="540" fill="#8793b5" font-size="22" font-weight="650" font-family="system-ui, sans-serif">${escapeXml(decodeNote)}</text>
<rect x="638" y="55" width="516" height="522" rx="26" fill="#0f1426" stroke="rgba(255,255,255,0.14)"/>
${renderBoardTiles(model.board)}
</svg>`;
}

const OGP_PALETTE = [
  [16, 21, 36],
  [21, 27, 47],
  [34, 40, 66],
  [247, 248, 255],
  [174, 185, 216],
  [135, 147, 181],
  [246, 241, 220],
  [38, 107, 254],
  [26, 32, 56],
  [40, 48, 77],
  [32, 36, 58],
  [248, 172, 156],
  [241, 129, 110],
  [235, 100, 82],
  [228, 82, 64],
  [222, 74, 58],
  [248, 212, 128],
  [244, 196, 96],
  [240, 182, 70],
  [235, 168, 46],
  [230, 156, 26],
  [128, 228, 184],
  [94, 215, 164],
  [64, 201, 145],
  [36, 188, 130],
  [14, 176, 118],
  [150, 184, 248],
  [124, 160, 242],
  [98, 136, 236],
  [76, 116, 230],
  [56, 100, 224],
  [255, 243, 214],
  [215, 155, 41],
  [22, 13, 43],
  [154, 124, 248],
  [255, 255, 255],
  [0, 0, 0],
];

const OGP = {
  BG: 0,
  PANEL: 1,
  STROKE: 2,
  TEXT: 3,
  MUTED: 4,
  SOFT: 5,
  WARM: 6,
  BLUE: 7,
  EMPTY: 8,
  TILE_STROKE: 9,
  DARK_TEXT: 10,
  RED: 11,
  YELLOW: 16,
  GREEN: 21,
  BLUE_TILE: 26,
  NOVA: 31,
  GOLD: 32,
  HOLE: 33,
  PURPLE: 34,
  WHITE: 35,
  BLACK: 36,
};

const FONT = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  "C": ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  "G": ["01111", "10000", "10000", "10011", "10001", "10001", "01110"],
  "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  "I": ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  "J": ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  "Q": ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  "W": ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  "Z": ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < table.length; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes) {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function u32(value) {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function bytesFromString(value) {
  return new TextEncoder().encode(value);
}

function concatBytes(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function pngChunk(type, data = new Uint8Array()) {
  const typeBytes = bytesFromString(type);
  return concatBytes([u32(data.length), typeBytes, data, u32(crc32(concatBytes([typeBytes, data])))]);
}

function zlibStore(bytes) {
  const parts = [new Uint8Array([0x78, 0x01])];
  for (let offset = 0; offset < bytes.length; offset += 65535) {
    const size = Math.min(65535, bytes.length - offset);
    const final = offset + size >= bytes.length ? 1 : 0;
    parts.push(
      new Uint8Array([
        final,
        size & 0xff,
        (size >>> 8) & 0xff,
        (~size) & 0xff,
        ((~size) >>> 8) & 0xff,
      ]),
      bytes.slice(offset, offset + size),
    );
  }
  parts.push(u32(adler32(bytes)));
  return concatBytes(parts);
}

function encodeIndexedPng(width, height, pixels) {
  const ihdr = new Uint8Array(13);
  ihdr.set(u32(width), 0);
  ihdr.set(u32(height), 4);
  ihdr[8] = 8;
  ihdr[9] = 3;

  const plte = new Uint8Array(OGP_PALETTE.length * 3);
  OGP_PALETTE.forEach((color, i) => plte.set(color, i * 3));

  const scanlines = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y++) {
    scanlines[y * (width + 1)] = 0;
    scanlines.set(pixels.slice(y * width, (y + 1) * width), y * (width + 1) + 1);
  }

  return concatBytes([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("PLTE", plte),
    pngChunk("IDAT", zlibStore(scanlines)),
    pngChunk("IEND"),
  ]);
}

function makeRaster(width, height, bg = OGP.BG) {
  const pixels = new Uint8Array(width * height);
  pixels.fill(bg);

  function fillRect(x, y, w, h, color) {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(width, Math.ceil(x + w));
    const y1 = Math.min(height, Math.ceil(y + h));
    for (let py = y0; py < y1; py++) pixels.fill(color, py * width + x0, py * width + x1);
  }

  function strokeRect(x, y, w, h, color, line = 2) {
    fillRect(x, y, w, line, color);
    fillRect(x, y + h - line, w, line, color);
    fillRect(x, y, line, h, color);
    fillRect(x + w - line, y, line, h, color);
  }

  function fillCircle(cx, cy, radius, color) {
    const r2 = radius * radius;
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
        if (x >= 0 && x < width && y >= 0 && y < height && (x - cx) ** 2 + (y - cy) ** 2 <= r2) {
          pixels[y * width + x] = color;
        }
      }
    }
  }

  return { pixels, fillRect, strokeRect, fillCircle };
}

function textWidth(text, scale) {
  return Math.max(0, String(text).length * 6 - 1) * scale;
}

function drawText(raster, text, x, y, scale, color, options = {}) {
  const normalized = String(text).toUpperCase();
  const startX =
    options.align === "center" ? x - Math.floor(textWidth(normalized, scale) / 2) :
      options.align === "right" ? x - textWidth(normalized, scale) :
        x;
  let cx = Math.floor(startX);
  for (const char of normalized) {
    const glyph = FONT[char] || FONT[" "];
    for (let gy = 0; gy < glyph.length; gy++) {
      for (let gx = 0; gx < glyph[gy].length; gx++) {
        if (glyph[gy][gx] === "1") raster.fillRect(cx + gx * scale, y + gy * scale, scale, scale, color);
      }
    }
    cx += 6 * scale;
  }
}

function fitTextScale(text, maxWidth, maxScale, minScale = 1) {
  let scale = maxScale;
  while (scale > minScale && textWidth(text, scale) > maxWidth) scale--;
  return scale;
}

function ogpTileColor(cell) {
  if (!cell) return OGP.EMPTY;
  if (cell.value >= HOLE_AT) return OGP.HOLE;
  if (cell.value >= NOVA_AT) return OGP.NOVA;
  const base = { red: OGP.RED, yellow: OGP.YELLOW, green: OGP.GREEN, blue: OGP.BLUE_TILE }[cell.color] || OGP.RED;
  return base + Math.min(4, Math.floor(growthT(cell) * 5));
}

function ogpTileTextColor(cell) {
  if (!cell) return OGP.SOFT;
  if (cell.value >= HOLE_AT) return OGP.WHITE;
  if (cell.value >= NOVA_AT) return OGP.DARK_TEXT;
  return growthT(cell) > 0.55 ? OGP.WHITE : OGP.DARK_TEXT;
}

function drawOgpTile(raster, cell, r, c) {
  const boardX = 665;
  const boardY = 82;
  const cellSize = 84;
  const gap = 12;
  const x = boardX + c * (cellSize + gap);
  const y = boardY + r * (cellSize + gap);
  const fill = ogpTileColor(cell);
  const textColor = ogpTileTextColor(cell);
  const accent = cell?.value >= HOLE_AT ? OGP.PURPLE : cell?.value >= NOVA_AT ? OGP.GOLD : OGP.WHITE;
  const symbol = tileSymbol(cell);

  raster.fillRect(x + 5, y + 6, cellSize, cellSize, OGP.BLACK);
  raster.fillRect(x, y, cellSize, cellSize, fill);
  raster.strokeRect(x, y, cellSize, cellSize, cell?.value >= NOVA_AT ? accent : OGP.TILE_STROKE, 3);
  raster.fillRect(x + 7, y + 7, cellSize - 14, 16, cell?.value >= HOLE_AT ? OGP.PURPLE : OGP.WHITE);
  raster.fillRect(x + 7, y + cellSize - 18, cellSize - 14, 11, OGP.BLACK);
  raster.fillCircle(x + 42, y + 32, cell?.value >= HOLE_AT ? 17 : 13 + Math.round(growthT(cell || { value: 1 }) * 14), accent);
  raster.fillCircle(x + 42, y + 32, cell?.value >= HOLE_AT ? 10 : 9, fill);

  if (cell && cell.value < HOLE_AT) {
    const mass = formatNumber(cell.value);
    const massScale = fitTextScale(mass, 54, 2);
    drawText(raster, mass, x + 10, y + 11, massScale, textColor);
  }

  const scale = fitTextScale(symbol, 66, symbol.length <= 2 ? 7 : 5, 2);
  drawText(raster, symbol, x + cellSize / 2, y + 43 - Math.floor((7 * scale) / 2), scale, textColor, { align: "center" });
}

function replayOgpPng(model) {
  const width = 1200;
  const height = 630;
  const raster = makeRaster(width, height);
  const score = formatNumber(model.score);
  const scoreScale = fitTextScale(score, 470, score.length > 9 ? 9 : 12, 5);
  const maxText = `MAX ${maxTileLabel(model.maxTile)}`;
  const boardNote = model.decodeFailed ? "BOARD PREVIEW UNAVAILABLE" : model.board ? "FINAL BOARD" : "REPLAY SUMMARY";

  raster.fillRect(0, 0, width, height, OGP.BG);
  raster.fillRect(48, 48, 1104, 534, OGP.PANEL);
  raster.strokeRect(48, 48, 1104, 534, OGP.STROKE, 3);
  raster.fillRect(638, 55, 516, 522, OGP.EMPTY);
  raster.strokeRect(638, 55, 516, 522, OGP.STROKE, 3);

  drawText(raster, "SUPERNOVA", 78, 82, 8, OGP.TEXT);
  drawText(raster, "REPLAY", 82, 150, 4, OGP.MUTED);
  drawText(raster, score, 78, 226, scoreScale, OGP.TEXT);
  drawText(raster, "POINTS", 84, 335, 4, OGP.MUTED);
  raster.fillRect(78, 394, 468, 3, OGP.STROKE);
  drawText(raster, maxText, 84, 430, fitTextScale(maxText, 460, 4, 2), OGP.WARM);
  drawText(raster, `${formatNumber(model.moves)} MOVES`, 84, 488, 4, OGP.TEXT);
  drawText(raster, boardNote, 84, 540, fitTextScale(boardNote, 455, 3, 2), OGP.SOFT);

  const board = model.board || Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => null));
  board.forEach((row, r) => row.forEach((cell, c) => drawOgpTile(raster, cell, r, c)));
  return encodeIndexedPng(width, height, raster.pixels);
}

async function handleCreateReplay(request, env) {
  if (!isAllowedRequestOrigin(request, env)) return errorResponse(request, env, 403, "forbidden_origin");
  if (!request.headers.get("Content-Type")?.toLowerCase().includes("application/json")) {
    return errorResponse(request, env, 415, "expected_json");
  }

  let body;
  try {
    body = await request.json();
    assertReplayPayload(body.payload, env);
  } catch (err) {
    const code = err?.message === "payload_too_large" ? "payload_too_large" : "invalid_payload";
    return errorResponse(request, env, code === "payload_too_large" ? 413 : 400, code);
  }

  const payload = body.payload;
  const id = await replayIdForPayload(payload);
  const key = `${KEY_PREFIX}${id}`;
  const now = new Date().toISOString();
  const existing = await env.REPLAYS.get(key, "json");

  if (existing?.payload && existing.payload !== payload) {
    return errorResponse(request, env, 409, "replay_id_collision");
  }

  if (!existing) {
    await env.REPLAYS.put(
      key,
      JSON.stringify({
        kind: "supernova-replay-share",
        version: API_VERSION,
        id,
        payload,
        payloadChars: payload.length,
        summary: cleanSummary(body.summary),
        createdAt: now,
      }),
      {
        metadata: {
          createdAt: now,
          payloadChars: payload.length,
        },
      },
    );
  }

  return jsonResponse(request, env, {
    id,
    payloadChars: payload.length,
    existing: Boolean(existing),
  });
}

async function handleGetReplay(request, env, id) {
  if (!ID_RE.test(id)) return errorResponse(request, env, 400, "invalid_replay_id");

  const record = await replayRecord(env, id);
  if (!record?.payload) return errorResponse(request, env, 404, "replay_not_found");

  return jsonResponse(
    request,
    env,
    {
      id,
      payload: record.payload,
      payloadChars: record.payloadChars ?? record.payload.length,
      createdAt: record.createdAt ?? null,
      summary: record.summary ?? {},
    },
    200,
    { "Cache-Control": "public, max-age=60" },
  );
}

async function handleGetReplayLanding(request, env, id) {
  if (!ID_RE.test(id)) return htmlResponse(replayNotFoundHtml(id), 400, { "Cache-Control": "no-store" });

  const record = await replayRecord(env, id, 300);
  if (!record?.payload) return htmlResponse(replayNotFoundHtml(id), 404, { "Cache-Control": "no-store" });

  const shareUrl = canonicalAbsoluteUrl(env, `/r/${id}`);
  const gameUrl = replayGameUrl(env, id);
  const imageUrl = canonicalAbsoluteUrl(env, `/r/${id}/og.png`);
  return htmlResponse(replayLandingHtml(replayModel(record, true), { shareUrl, gameUrl, imageUrl, imageType: "image/png" }), 200, {
    "Cache-Control": "public, max-age=300",
  });
}

async function handleGetReplayOgpImage(request, env, id, imageType) {
  if (!ID_RE.test(id)) {
    return imageType === "svg"
      ? svgResponse(replayOgpSvg(replayModel(null)), 400, { "Cache-Control": "no-store" })
      : pngResponse(replayOgpPng(replayModel(null)), 400, { "Cache-Control": "no-store" });
  }

  const record = await replayRecord(env, id, 3600);
  if (!record?.payload) {
    return imageType === "svg"
      ? svgResponse(replayOgpSvg(replayModel(null)), 404, { "Cache-Control": "no-store" })
      : pngResponse(replayOgpPng(replayModel(null)), 404, { "Cache-Control": "no-store" });
  }

  const model = replayModel(record, true);
  if (imageType === "svg") {
    return svgResponse(replayOgpSvg(model), 200, {
      "Cache-Control": "public, max-age=3600",
    });
  }

  return pngResponse(replayOgpPng(model), 200, {
    "Cache-Control": "public, max-age=3600",
  });
}

function routeApiReplayId(pathname) {
  const match = pathname.match(/^\/v1\/replays\/([^/]+)$/);
  return match ? match[1] : null;
}

function routeReplayShare(pathname) {
  const match = pathname.match(/^\/r\/([^/]+)(?:\/(og\.(svg|png)))?$/);
  if (!match) return null;
  return { id: match[1], image: match[3] || null };
}

export default {
  async fetch(request, env) {
    const redirect = legacyWorkerRedirect(request, env);
    if (redirect) return redirect;

    if (request.method === "OPTIONS") {
      if (!isAllowedRequestOrigin(request, env)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    const url = new URL(request.url);
    const shareRoute = routeReplayShare(url.pathname);
    if ((request.method === "GET" || request.method === "HEAD") && shareRoute) {
      return shareRoute.image
        ? handleGetReplayOgpImage(request, env, shareRoute.id, shareRoute.image)
        : handleGetReplayLanding(request, env, shareRoute.id);
    }

    if (request.method === "GET" && url.pathname === "/v1/health") {
      return jsonResponse(request, env, { ok: true, service: "supernova-replay-api" });
    }
    if (request.method === "POST" && url.pathname === "/v1/replays") {
      return handleCreateReplay(request, env);
    }

    const replayId = routeApiReplayId(url.pathname);
    if (request.method === "GET" && replayId) {
      return handleGetReplay(request, env, replayId);
    }

    if (request.method === "GET" && env.ASSETS) return env.ASSETS.fetch(request);

    return errorResponse(request, env, 404, "not_found");
  },
};
