# Custom Domain Full Migration Cutover

Date: 2026-08-13

## Tono Question

> ドメインを割り当てるなら、ゲーム本体も移しちゃいたいと思うがどう思う？
>
> 以前のURLからのリダイレクト処理（パラメーター付き共有URL等も適切に）をちゃんとしたい。

## Recommendation

Recommend moving the public game hostname to `https://supernova.tonochan.jp/`, but keep the current GitHub Pages deployment as a compatibility bridge for old links.

This is a full public URL migration, not a framework rewrite. The app can stay Vanilla JS/CSS/HTML. The natural production shape is one Cloudflare Worker with:

- static game assets at `/`, `index.html`, `style.css`, `game.js`, and `assets/*`
- replay API at `/v1/*`
- replay share landing pages at `/r/:id`
- OGP images at `/r/:id/og.png` or `/r/:id/og.jpg`

This is better than only moving `/r/:id` because:

- the share URL and the game URL use the same clean domain
- replay landing pages can redirect to same-origin playback: `/?replay=srv1...`
- the browser app can eventually call same-origin `/v1/*`, reducing CORS surface
- future ranking, player history, admin views, and AI-analysis data endpoints can live under the same origin
- old GitHub Pages URLs can remain as a thin bridge instead of continuing to be the primary app

## Target URL Shape

| Purpose | New canonical URL |
| --- | --- |
| Game top | `https://supernova.tonochan.jp/` |
| Replay playback in browser | `https://supernova.tonochan.jp/?replay=srv1TLlUZkSDP0ACY1Z0` |
| Replay share / OGP landing | `https://supernova.tonochan.jp/r/TLlUZkSDP0ACY1Z0` |
| Replay OGP image | `https://supernova.tonochan.jp/r/TLlUZkSDP0ACY1Z0/og.png` |
| Replay API | `https://supernova.tonochan.jp/v1/replays/...` |
| Beta, optional later | `https://beta.supernova.tonochan.jp/` or keep `https://tonochan.github.io/supernova/beta/` for now |

Use `/r/:id` only as the crawler-friendly share landing page. Browser playback should continue to use `?replay=srv1...` because the current app already understands that format.

## Old URL Compatibility

| Old URL | Desired behavior | Replay ID preservation | How |
| --- | --- | --- | --- |
| `https://tonochan.github.io/supernova/` | Browser goes to `https://supernova.tonochan.jp/` | N/A | GitHub Pages compatibility HTML with JavaScript redirect and fallback link |
| `https://tonochan.github.io/supernova/?replay=srv1TLlUZkSDP0ACY1Z0` | Browser goes to `https://supernova.tonochan.jp/?replay=srv1TLlUZkSDP0ACY1Z0` | Yes | JS bridge copies `location.search` |
| `https://tonochan.github.io/supernova/#replay=snr1...` | Browser goes to `https://supernova.tonochan.jp/#replay=snr1...` | Yes | JS bridge copies `location.hash`; new app keeps legacy inline replay decode |
| `https://supernova-replay-api.tonosaki-shuntaro.workers.dev/r/:id` | HTTP redirect to `https://supernova.tonochan.jp/r/:id` | Yes | Worker host check returns `301` or `308`, preserving path and query |
| Existing clicked/bookmarked `https://supernova-replay-api.tonosaki-shuntaro.workers.dev/r/:id` | Crawler/browser sees new canonical OGP after redirect | Yes | Keep workers.dev enabled as compatibility route |
| Existing API calls to `https://supernova-replay-api.tonosaki-shuntaro.workers.dev/v1/*` | Keep working during transition | Replay data preserved | Do not redirect API immediately; old cached clients and old GitHub Pages app versions may still call it |
| Old static preview pages under `/replay-ogp-preview/` | Leave as historical preview URLs | N/A | Do not rewrite unless they confuse users |
| `https://tonochan.github.io/supernova/beta/` | Keep beta as-is for now | Existing beta behavior | Migrate beta separately only if needed |

Compatibility bridge sketch for GitHub Pages `index.html` after cutover:

```html
<script>
  const target = new URL("https://supernova.tonochan.jp/");
  target.search = window.location.search;
  target.hash = window.location.hash;
  window.location.replace(target.toString());
</script>
<link rel="canonical" href="https://supernova.tonochan.jp/">
<meta name="robots" content="noindex">
<p>SUPERNOVA moved to <a href="https://supernova.tonochan.jp/">supernova.tonochan.jp</a>.</p>
```

This is not an HTTP 301. It is good for humans opening old bookmarks and shared links. It does not give old `tonochan.github.io` replay URLs dynamic, replay-specific OGP cards.

## GitHub Pages Redirect Limits

GitHub Pages is static repository hosting. It can serve a custom `404.html`, and it can serve a replacement `index.html`, but it cannot run server-side logic that reads query parameters and emits a replay-specific HTTP redirect or replay-specific OGP tags.

Implications:

- Old `tonochan.github.io/supernova/?replay=srv1...` links can preserve replay IDs for browser users via JavaScript.
- OGP crawlers hitting old GitHub Pages URLs will only see the static bridge HTML. They will not get score-specific preview data.
- Existing Worker share URLs can be properly redirected server-side because the Worker can inspect the host/path before responding.
- If old GitHub Pages OGP previews matter, the only reliable path remains per-replay static HTML generation on GitHub Pages, but this conflicts with the current desire to avoid GitHub-side replay pages.

## SEO, Canonical, And OGP

- `https://supernova.tonochan.jp/` should be the canonical app URL.
- `https://supernova.tonochan.jp/r/:id` should be the canonical replay share URL.
- The replay landing HTML should set:
  - `link rel="canonical"` to the same `/r/:id` URL
  - `og:url` to the same `/r/:id` URL
  - `og:image` to PNG/JPEG, not SVG
  - `og:image:type` to `image/png` or `image/jpeg`
- The GitHub Pages bridge should use `noindex` and a canonical link to `https://supernova.tonochan.jp/`.
- The old workers.dev share route should redirect to the new `/r/:id`, so crawlers can land on the canonical OGP response.

## Cutover Packet

### Preparation

1. Add Worker Static Assets configuration, with the repo root or a prepared public directory as the asset source.
2. Keep Worker code in front of the static assets for `/v1/*`, `/r/*`, and migration redirects.
3. Change the browser app so production can use same-origin API/share URLs when hosted on `supernova.tonochan.jp`.
4. Add PNG/JPEG OGP image output or a durable cached PNG/JPEG origin.
5. Add host-based compatibility redirect from `supernova-replay-api.tonosaki-shuntaro.workers.dev/r/:id` to `https://supernova.tonochan.jp/r/:id`.
6. Keep old workers.dev `/v1/*` API responses enabled until old cached clients have aged out.
7. Prepare the GitHub Pages compatibility bridge, but do not publish it until the new domain is verified.

### Verification Before Public Switch

1. Test Worker on a non-production route or beta Worker:
   - `/`
   - `/style.css`
   - `/game.js`
   - `/v1/health`
   - `/r/TLlUZkSDP0ACY1Z0`
   - `/r/TLlUZkSDP0ACY1Z0/og.png`
   - `/?replay=srv1TLlUZkSDP0ACY1Z0`
2. Verify replay save and replay load from the hosted app.
3. Verify OGP HTML contains score, max tile, move count, canonical URL, and PNG/JPEG image.
4. Verify old workers.dev `/r/:id` redirects to the new custom domain.
5. Verify old workers.dev `/v1/health` still works for compatibility.
6. Verify GitHub Pages bridge locally with normal, `?replay=srv1...`, and `#replay=snr1...` URLs.

### DNS / Domain Switch

1. Create the Cloudflare Worker custom domain for `supernova.tonochan.jp`.
2. Let Cloudflare create/manage the DNS/certificate for that exact hostname.
3. Test the new host before changing GitHub Pages.
4. Switch game sharing code to emit `https://supernova.tonochan.jp/r/:id`.
5. Publish the GitHub Pages compatibility bridge.
6. Keep the old GitHub Pages project and workers.dev route alive for at least a few weeks.

Downtime should be near zero if the old URLs stay live until the new domain is verified. DNS propagation can still be uneven, so the old GitHub Pages and workers.dev routes should not be removed during the cutover.

### Rollback

Rollback targets:

- If the custom domain app is unhealthy before publishing the GitHub Pages bridge: remove or pause the custom domain route and keep current GitHub Pages + workers.dev production unchanged.
- If the custom domain app is unhealthy after the bridge is published: revert the GitHub Pages bridge commit so `tonochan.github.io/supernova/` serves the app again, and change share URL generation back to workers.dev.
- If only OGP PNG/JPEG fails: keep the custom domain app, but temporarily point `og:image` to a default static PNG or fall back to the known-good static PNG preview while fixing dynamic image generation.
- If Worker API fails: roll back to the previous Worker version and keep GitHub Pages bridge disabled until replay save/load passes.

Do not disable GitHub Pages immediately. It is the rollback and old-link safety net.

## Implementation Notes

Cloudflare Workers Static Assets can deploy Worker code and static files together. For Supernova, a likely Wrangler direction is:

```jsonc
{
  "name": "supernova",
  "main": "./workers/replay-api/worker.mjs",
  "compatibility_date": "2026-08-13",
  "assets": {
    "directory": "./public",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/v1/*", "/r/*"]
  }
}
```

Because the repo currently deploys the whole root to GitHub Pages, a small `public/` or generated `dist/` directory is cleaner than pointing Worker assets at the repository root. It avoids uploading `.github`, docs, prototypes, and worker source as public assets.

Minimum asset set:

- `index.html`
- `style.css`
- `game.js`
- `assets/fonts/fredoka-latin.woff2`
- any future icons/manifest/image assets

## One-Sentence GO Needed From Tono

「`supernova.tonochan.jp` をSUPERNOVAの本番ホストにして、ゲーム本体・API・リプレイ共有をCloudflare Workerへ移し、GitHub Pagesと旧workers.dev URLは互換redirectとして残す」でGOください。
