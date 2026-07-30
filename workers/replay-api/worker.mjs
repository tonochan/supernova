"use strict";

const API_VERSION = 1;
const KEY_PREFIX = "replay:";
const MAX_PAYLOAD_CHARS = 262144;
const ID_BYTES = 12;
const ID_RE = /^[A-Za-z0-9_-]{16}$/;
const PAYLOAD_RE = /^snr1[A-Za-z0-9_-]+$/;
const DEFAULT_ALLOWED_ORIGINS = [
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

  const bytes = base64UrlToBytes(payload.slice("snr1".length));
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

  const record = await env.REPLAYS.get(`${KEY_PREFIX}${id}`, {
    type: "json",
    cacheTtl: 60,
  });
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

function routeReplayId(pathname) {
  const match = pathname.match(/^\/v1\/replays\/([^/]+)$/);
  return match ? match[1] : null;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      if (!isAllowedRequestOrigin(request, env)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/v1/health") {
      return jsonResponse(request, env, { ok: true, service: "supernova-replay-api" });
    }
    if (request.method === "POST" && url.pathname === "/v1/replays") {
      return handleCreateReplay(request, env);
    }

    const replayId = routeReplayId(url.pathname);
    if (request.method === "GET" && replayId) {
      return handleGetReplay(request, env, replayId);
    }

    return errorResponse(request, env, 404, "not_found");
  },
};
