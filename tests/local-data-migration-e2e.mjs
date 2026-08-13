import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const compatRoot = path.join(repoRoot, "compat-pages");
const chromePath = process.env.CHROME_BIN || "/usr/bin/google-chrome";

let appServer;
let bridgeServer;
let chrome;
let userDataDir;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

function startStaticServer(root) {
  return new Promise((resolve) => {
    const server = http.createServer(async (request, response) => {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith("/")) pathname += "index.html";
      const filePath = path.resolve(root, "." + pathname);
      if (filePath !== root && !filePath.startsWith(root + path.sep)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }
      try {
        const body = await fs.readFile(filePath);
        response.writeHead(200, {
          "Cache-Control": "no-store",
          "Content-Type": contentType(filePath),
        });
        response.end(body);
      } catch (_) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, origin: `http://127.0.0.1:${address.port}` });
    });
  });
}

function freePort() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForHttp(url, timeoutMs = 8000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

async function startChrome() {
  const debuggingPort = await freePort();
  userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "supernova-e2e-"));
  chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-popup-blocking",
    "--no-sandbox",
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${debuggingPort}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "ignore"] });
  await waitForHttp(`http://127.0.0.1:${debuggingPort}/json/version`);
  return debuggingPort;
}

async function newCdpPage(debuggingPort, url = "about:blank") {
  const response = await fetch(`http://127.0.0.1:${debuggingPort}/json/new?${encodeURIComponent(url)}`, {
    method: "PUT",
  });
  if (!response.ok) throw new Error(`Could not create page: ${response.status}`);
  const target = await response.json();
  return new CdpPage(target.webSocketDebuggerUrl);
}

class CdpPage {
  constructor(webSocketUrl) {
    this.id = 0;
    this.pending = new Map();
    this.eventWaiters = new Map();
    this.socket = new WebSocket(webSocketUrl);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => this.onMessage(event));
  }

  onMessage(event) {
    const text = typeof event.data === "string" ? event.data : event.data.toString();
    const message = JSON.parse(text);
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result || {});
      return;
    }
    if (message.method && this.eventWaiters.has(message.method)) {
      const waiters = this.eventWaiters.get(message.method);
      this.eventWaiters.delete(message.method);
      for (const resolve of waiters) resolve(message.params || {});
    }
  }

  async send(method, params = {}) {
    await this.ready;
    const id = ++this.id;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, 6000);
    });
  }

  waitEvent(method) {
    return new Promise((resolve) => {
      const waiters = this.eventWaiters.get(method) || [];
      waiters.push(resolve);
      this.eventWaiters.set(method, waiters);
    });
  }

  async navigate(url) {
    await this.send("Page.enable");
    const loaded = this.waitEvent("Page.loadEventFired");
    await this.send("Page.navigate", { url });
    await loaded;
  }

  async addInitScript(source) {
    await this.send("Page.addScriptToEvaluateOnNewDocument", { source });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
    }
    return result.result?.value;
  }

  async waitFor(expression, timeoutMs = 7000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (await this.evaluate(expression)) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for ${expression}`);
  }

  close() {
    this.socket.close();
  }
}

function sampleBoard(value = 1, color = "red") {
  return Array.from({ length: 5 }, () =>
    Array.from({ length: 5 }, () => ({ value, color }))
  );
}

function sampleReplay(score = 777, completedAt = "2026-01-02T00:00:00.000Z") {
  const board = sampleBoard();
  return {
    kind: "supernova-replay",
    schemaVersion: 1,
    rulesVersion: 1,
    appVersion: "test",
    createdAt: "2026-01-01T00:00:00.000Z",
    completedAt,
    boardSize: 5,
    rng: { mode: "test" },
    initial: board,
    moves: [],
    final: {
      score,
      maxTile: 1,
      endedBy: "test",
      moves: 0,
      isNewBest: false,
      afterHash: "",
    },
  };
}

function sampleGameState(score, savedAt) {
  return {
    kind: "supernova-game-state",
    schemaVersion: 1,
    rulesVersion: 1,
    appVersion: "test",
    savedAt,
    boardSize: 5,
    grid: sampleBoard(),
    score,
    best: score,
    maxTile: 1,
    firstMergeDone: score > 0,
    currentReplay: null,
  };
}

async function seedOldStorage(debuggingPort, bridgeOrigin, appOrigin, values) {
  const page = await newCdpPage(debuggingPort);
  await page.navigate(`${bridgeOrigin}/migrate/?targetOrigin=${encodeURIComponent(appOrigin)}`);
  await page.evaluate(`
    (() => {
      const values = ${JSON.stringify(values)};
      localStorage.clear();
      for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
      return true;
    })()
  `);
  page.close();
}

async function createAppPage(debuggingPort, bridgeOrigin, appOrigin, setupStorage = {}) {
  const page = await newCdpPage(debuggingPort);
  await page.addInitScript(`
    window.__SUPERNOVA_MIGRATION_BRIDGE_URL = ${JSON.stringify(`${bridgeOrigin}/migrate/?targetOrigin=${encodeURIComponent(appOrigin)}`)};
    window.__SUPERNOVA_MIGRATION_SOURCE_ORIGIN = ${JSON.stringify(bridgeOrigin)};
    window.__SUPERNOVA_MIGRATION_TARGET_ORIGIN = ${JSON.stringify(appOrigin)};
    for (const [key, value] of Object.entries(${JSON.stringify(setupStorage)})) {
      localStorage.setItem(key, value);
    }
  `);
  await page.navigate(appOrigin);
  await page.waitFor("!!document.querySelector('#migration-btn')");
  return page;
}

async function runImport(page) {
  await page.evaluate(`
    document.querySelector('#migration-btn').click();
    document.querySelector('#migration-start').click();
  `);
}

async function testImportMerge(debuggingPort, bridgeOrigin, appOrigin) {
  await seedOldStorage(debuggingPort, bridgeOrigin, appOrigin, {
    "supernova-best": "9999",
    "supernova-found": JSON.stringify([1, 79]),
    "supernova-last-replay": JSON.stringify(sampleReplay(777)),
    "supernova-replay-history": JSON.stringify([
      { id: "old-replay", savedAt: "2026-01-02T00:00:00.000Z", replay: sampleReplay(777) },
    ]),
    "supernova-game-state": JSON.stringify(sampleGameState(222, "2026-02-01T00:00:00.000Z")),
    "supernova-lang": "ja",
  });

  const page = await createAppPage(debuggingPort, bridgeOrigin, appOrigin, {
    "supernova-best": "12000",
    "supernova-found": JSON.stringify([1, 2]),
  });
  await page.evaluate(`localStorage.setItem("supernova-game-state", ${JSON.stringify(JSON.stringify(sampleGameState(333, "2026-03-01T00:00:00.000Z")))})`);
  await runImport(page);
  await page.waitFor(`/取り込みました|Imported/.test(document.querySelector('#migration-status')?.textContent || '')`);

  const storage = await page.evaluate(`
    (() => ({
      best: localStorage.getItem("supernova-best"),
      found: JSON.parse(localStorage.getItem("supernova-found") || "[]"),
      replay: JSON.parse(localStorage.getItem("supernova-last-replay") || "null"),
      history: JSON.parse(localStorage.getItem("supernova-replay-history") || "[]"),
      state: JSON.parse(localStorage.getItem("supernova-game-state") || "null"),
      lang: localStorage.getItem("supernova-lang"),
    }))()
  `);

  assert(storage.best === "12000", "new-origin best score was downgraded");
  assert(storage.found.includes(1) && storage.found.includes(2) && storage.found.includes(79), "found elements were not merged");
  assert(storage.replay?.final?.score === 777, "last replay was not imported");
  assert(storage.history.length === 1 && storage.history[0].id === "old-replay", "replay history was not imported");
  assert(storage.state?.score === 333, "newer in-progress game state was overwritten");
  assert(storage.lang === "ja", "language setting was not imported");
  page.close();
}

async function testNoData(debuggingPort, bridgeOrigin, appOrigin) {
  await seedOldStorage(debuggingPort, bridgeOrigin, appOrigin, {});
  const page = await createAppPage(debuggingPort, bridgeOrigin, appOrigin);
  await runImport(page);
  await page.waitFor(`/No old saved data|見つかりません/.test(document.querySelector('#migration-status')?.textContent || '')`);
  page.close();
}

async function testPopupBlocked(debuggingPort, bridgeOrigin, appOrigin) {
  const page = await createAppPage(debuggingPort, bridgeOrigin, appOrigin);
  await page.evaluate("window.open = () => null");
  await runImport(page);
  await page.waitFor(`/could not open|開けません/.test(document.querySelector('#migration-status')?.textContent || '')`, 3000);
  page.close();
}

async function main() {
  const app = await startStaticServer(repoRoot);
  const bridge = await startStaticServer(compatRoot);
  appServer = app.server;
  bridgeServer = bridge.server;
  const debuggingPort = await startChrome();

  try {
    await testImportMerge(debuggingPort, bridge.origin, app.origin);
    await testNoData(debuggingPort, bridge.origin, app.origin);
    await testPopupBlocked(debuggingPort, bridge.origin, app.origin);
    console.log("local data migration E2E passed");
  } finally {
    appServer.close();
    bridgeServer.close();
    await new Promise((resolve) => {
      chrome.once("exit", resolve);
      chrome.kill();
      setTimeout(resolve, 1000);
    });
    await fs.rm(userDataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
