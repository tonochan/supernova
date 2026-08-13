#!/usr/bin/env node
"use strict";

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const DEFAULT_API_BASE = "https://supernova-replay-api.tonosaki-shuntaro.workers.dev";
const DEFAULT_PAGE_BASE = "https://tonochan.github.io/supernova/static-replays";
const DEFAULT_GAME_BASE = "https://tonochan.github.io/supernova/";
const DEFAULT_OUT_DIR = "static-replays";
const ID_RE = /^[A-Za-z0-9_-]{16}$/;

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

function usage() {
  return [
    "Usage:",
    "  node tools/generate-static-replay-share.mjs <replay-id> [--out-dir static-replays] [--page-base https://tonochan.github.io/supernova/static-replays]",
    "",
    "Example:",
    "  node tools/generate-static-replay-share.mjs TLlUZkSDP0ACY1Z0",
  ].join("\n");
}

function parseArgs(argv) {
  const [id, ...rest] = argv;
  if (!id || id === "--help" || id === "-h") {
    console.log(usage());
    process.exit(id ? 0 : 1);
  }
  if (!ID_RE.test(id)) throw new Error(`Invalid replay id: ${id}`);

  const options = {
    id,
    apiBase: DEFAULT_API_BASE,
    pageBase: DEFAULT_PAGE_BASE,
    gameBase: DEFAULT_GAME_BASE,
    outDir: DEFAULT_OUT_DIR,
  };

  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    const value = rest[i + 1];
    if (!value) throw new Error(`Missing value for ${flag}`);
    if (flag === "--api-base") options.apiBase = value.replace(/\/+$/, "");
    else if (flag === "--page-base") options.pageBase = value.replace(/\/+$/, "");
    else if (flag === "--game-base") options.gameBase = value;
    else if (flag === "--out-dir") options.outDir = value;
    else throw new Error(`Unknown option: ${flag}`);
  }

  return options;
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} failed: ${response.status}`);
  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} failed: ${response.status}`);
  return response.json();
}

function metaContent(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<meta\\s+(?:property|name)=["']${escaped}["']\\s+content=["']([^"']*)["']`, "i");
  const match = html.match(pattern);
  return match ? unescapeHtml(match[1]) : null;
}

function formatNumber(value) {
  return Math.max(0, Math.floor(Number(value) || 0)).toLocaleString("en-US");
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

function unescapeHtml(value) {
  return String(value).replace(/&(amp|lt|gt|quot|#39);/g, (_, entity) => ({
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    "#39": "'",
  })[entity]);
}

function renderHtml({ id, pageUrl, imageUrl, gameUrl, title, description }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="canonical" href="${escapeHtml(pageUrl)}">
<meta name="description" content="${escapeHtml(description)}">
<meta property="og:site_name" content="SUPERNOVA">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${escapeHtml(pageUrl)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(imageUrl)}">
<meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${escapeHtml(`SUPERNOVA replay final board. ${description}.`)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(imageUrl)}">
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#101524;color:#f6f7fb;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{width:min(520px,calc(100% - 32px));text-align:center}
h1{margin:0 0 12px;font-size:32px}
p{margin:0 0 24px;color:#cfd6e8}
a{color:#fff;background:#246bfe;border-radius:8px;display:inline-block;padding:12px 18px;text-decoration:none;font-weight:700}
</style>
<script>window.location.replace(${JSON.stringify(gameUrl)});</script>
</head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(description)}</p>
<a href="${escapeHtml(gameUrl)}">Open replay</a>
<p style="margin-top:18px;font-size:12px;color:#6f7da1">${escapeHtml(id)}</p>
</main>
</body>
</html>
`;
}

function convertSvgToPng(svgPath, pngPath) {
  const result = spawnSync(
    "magick",
    [svgPath, "-background", "#101524", "-alpha", "remove", "-alpha", "off", "-strip", "-depth", "8", pngPath],
    { stdio: "inherit" },
  );
  if (result.status !== 0) throw new Error("ImageMagick conversion failed");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const replay = await fetchJson(`${options.apiBase}/v1/replays/${encodeURIComponent(options.id)}`);
  const landingHtml = await fetchText(`${options.apiBase}/r/${encodeURIComponent(options.id)}`);
  const svg = await fetchText(`${options.apiBase}/r/${encodeURIComponent(options.id)}/og.svg`);

  const summary = replay.summary || {};
  const score = Number(summary.score) || 0;
  const moves = Number(summary.moves) || 0;

  const title = metaContent(landingHtml, "og:title") || `SUPERNOVA Replay - ${formatNumber(score)} pts`;
  const description = metaContent(landingHtml, "og:description") || `Replay / ${formatNumber(moves)} moves`;
  const pageUrl = `${options.pageBase}/${options.id}/`;
  const imageUrl = `${pageUrl}og.png`;
  const gameUrl = new URL(options.gameBase);
  gameUrl.searchParams.set("replay", `srv1${options.id}`);

  const outDir = join(repoRoot, options.outDir, options.id);
  const svgPath = join(outDir, "og.svg");
  const pngPath = join(outDir, "og.png");
  const htmlPath = join(outDir, "index.html");

  await mkdir(outDir, { recursive: true });
  await writeFile(svgPath, svg);
  convertSvgToPng(svgPath, pngPath);
  await writeFile(
    htmlPath,
    renderHtml({ id: options.id, pageUrl, imageUrl, gameUrl: gameUrl.toString(), title, description }),
  );

  console.log(JSON.stringify({ pageUrl, imageUrl, outDir, htmlPath, pngPath, svgPath }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
