# Replay OGP PNG Options

Date: 2026-08-13

Related architecture note:

- `docs/replay-ogp-no-static-html-architecture.md` covers whether GitHub Pages can avoid per-replay HTML entirely, and why a custom-domain Worker is the recommended production path if JavaScript-only OGP is not enough.

## Current Fact Pattern

- Production share URL: `https://supernova-replay-api.tonosaki-shuntaro.workers.dev/r/:id`
- Production OGP image: `image/svg+xml` at `/r/:id/og.svg`
- Tono reported that the current production share URL does not show an image in the target sharing surface.
- The confirmed-good beta preview used static HTML plus a static PNG on GitHub Pages.

LINE's official FAQ says URL previews are generated from Open Graph tags, including `og:image`. The current production HTML has those tags, so the likely failing point is the image format or crawler compatibility, not missing metadata.

References checked:

- LINE Developers FAQ: https://developers.line.biz/ja/faq/
- LINE LIFF OGP tags: https://developers.line.biz/en/docs/liff/developing-liff-apps/#setting-ogp-tags
- Open Graph protocol: https://ogp.me/
- Cloudflare Workers best practices: https://developers.cloudflare.com/workers/best-practices/workers-best-practices/
- Wrangler: https://developers.cloudflare.com/workers/wrangler/

## Options

### A. GitHub Pages share page with cross-origin PNG image

Shape:

- Share URL becomes `https://tonochan.github.io/supernova/static-replays-hybrid/:id/`.
- GitHub Pages stores only replay-specific `index.html`.
- `og:image` is an absolute HTTPS URL on another origin, for example Worker, R2/CDN, or a pinned raw GitHub image URL.
- Browser users are redirected to `https://tonochan.github.io/supernova/?replay=srv1<id>`.

Pros:

- Keeps the visible share URL on `tonochan.github.io`.
- Avoids storing a PNG file on GitHub Pages for every replay.
- Uses the same crawler-friendly static HTML mechanism as the confirmed-good PNG preview.
- Allows image generation/storage to move to a Worker/CDN system optimized for binary assets.

Cons:

- GitHub Pages still needs a real per-replay `index.html`; a shared `?replay=srv1...` page cannot emit different OGP for each replay without JavaScript, and crawlers should not be relied on to run game JavaScript.
- The image origin must return a direct `200` over HTTPS with a correct image `Content-Type` such as `image/png` or `image/jpeg`.
- If the image origin is down, blocked, slow, or returns SVG/HTML/error content, the share card may show text without an image. The fallback should be a default static PNG or a durable cached PNG.

Recommendation if Tono wants `tonochan.github.io` as the shared URL: best compromise. It still needs an HTML publisher, but it removes per-replay PNG storage from Pages.

### B. Keep Worker share URL, change dynamic image to PNG or JPEG

Shape:

- Share URL remains `https://supernova-replay-api.tonosaki-shuntaro.workers.dev/r/:id`.
- Worker returns dynamic HTML with `og:image` pointing to `/r/:id/og.png`.
- Worker returns `image/png` or `image/jpeg`.

Pros:

- Immediate share URL generation can stay synchronous.
- No GitHub repository writes per replay.
- Replay data remains in KV, which is already the source of truth.

Cons:

- The current Worker renders SVG. Converting that SVG to PNG inside a Worker needs a rasterizer such as a WASM renderer, Browser Rendering, or another image service.
- This does not satisfy the ideal `tonochan.github.io` share URL.

Recommendation if image reliability is the only blocker: best production path.

### C. GitHub Pages pre-generated replay pages

Shape:

- Share URL becomes `https://tonochan.github.io/supernova/static-replays/:id/`.
- Each replay gets committed/generated as:
  - `index.html` with replay-specific OGP meta
  - `og.png`
- Browser users are redirected to `https://tonochan.github.io/supernova/?replay=srv1<id>`.

Pros:

- Matches the confirmed-good static PNG mechanism.
- Uses the desired `tonochan.github.io` host.
- Crawler gets plain static HTML and a PNG file.

Cons:

- GitHub Pages is static, so arbitrary replay IDs cannot appear there unless something writes files first.
- Automating this from normal gameplay needs a GitHub write token, GitHub Actions dispatch, or another trusted server-side publisher.
- Pages deploy latency means the share URL may not preview correctly immediately after game over.
- The repo or `gh-pages` branch grows with every shared replay.

Recommendation if `tonochan.github.io` is mandatory: viable, but not the smallest production mechanism.

This is the only option that keeps the visible share URL on `tonochan.github.io` for every replay. The important constraint is that every replay URL must exist as a real static file before it is shared. Query-string URLs such as `https://tonochan.github.io/supernova/?replay=srv1...` cannot have replay-specific OGP on GitHub Pages because the HTML file is the same for every query string and crawlers do not depend on the game JavaScript to generate meta tags.

### D. Custom domain routed to Worker

Shape:

- Share URL becomes something like `https://supernova.tonochan.jp/r/:id`.
- Static game remains on GitHub Pages.
- Worker owns only replay share HTML and PNG/JPEG images.

Pros:

- Short, branded URL.
- Dynamic and immediate.
- No repository churn.

Cons:

- Requires DNS/custom domain approval.
- Still needs Worker-side PNG/JPEG generation.

Recommendation if Tono can accept not using `tonochan.github.io`: best long-term shape.

## CORS And Crawler Conditions

- OGP crawlers fetch the HTML and then fetch the absolute `og:image` URL as normal HTTP resources.
- CORS is mainly a browser JavaScript/read-access control. It is not the core requirement for an OGP crawler to download an image, but permissive CORS does not hurt and is useful for diagnostics.
- Required in practice:
  - absolute HTTPS image URL
  - direct `200` response, ideally no redirects
  - `Content-Type: image/png` or `image/jpeg`
  - reasonable `Cache-Control`
  - no auth, cookies, hotlink protection, bot block, or `robots.txt` rule that blocks the crawler
  - stable dimensions, here `1200x630`

The local prototype verifies the hybrid page shape. The raw GitHub image used in the prototype returns `Content-Type: image/png`, `Access-Control-Allow-Origin: *`, and `Cross-Origin-Resource-Policy: cross-origin`. Those CORS headers are not the reason OGP works, but they show the image is publicly readable from another origin.

## Storage, Publisher, And Fallback Comparison

| Approach | Pages storage per replay | Required publisher | Share preview latency | Image fallback |
| --- | ---: | --- | --- | --- |
| Pages HTML + Pages PNG | HTML + about 100 KB PNG | GitHub/Actions writer | Wait for Pages deploy | Static default PNG in repo |
| Pages HTML + external PNG | HTML only | GitHub/Actions writer for HTML, image writer for PNG origin | Wait for Pages HTML deploy; image can be ready independently | `og:image` can point to prebuilt default PNG if replay image missing |
| Worker URL + Worker PNG | none on Pages | Worker deploy/runtime only | Immediate after replay save | Worker can return default PNG on decode/render failure |
| Custom domain Worker PNG | none on Pages | Worker deploy/runtime + DNS | Immediate after replay save | Worker can return default PNG on decode/render failure |

For Tono's exact wish, "share URL on GitHub Pages, image on another server", the second row is the smallest matching shape.

## Prototype Included

`tools/generate-static-replay-share.mjs` generates a GitHub Pages-compatible static replay share page from an existing server replay ID:

```sh
node tools/generate-static-replay-share.mjs TLlUZkSDP0ACY1Z0
```

It fetches the existing Worker replay and SVG image, converts the SVG to PNG using ImageMagick, and writes:

- `static-replays/:id/index.html`
- `static-replays/:id/og.png`
- `static-replays/:id/og.svg`

This proves the GitHub Pages static PNG route can match the beta mechanism. It is not yet an automatic production flow.

The same tool can also write a hybrid HTML-only page whose OGP image is hosted elsewhere:

```sh
node tools/generate-static-replay-share.mjs TLlUZkSDP0ACY1Z0 \
  --out-dir static-replays-hybrid \
  --page-base https://tonochan.github.io/supernova/static-replays-hybrid \
  --image-url https://raw.githubusercontent.com/tonochan/supernova/974d1568fba8c2b6c923d97be0903317dc72872d/static-replays/TLlUZkSDP0ACY1Z0/og.png \
  --skip-image-files
```

It writes only:

- `static-replays-hybrid/:id/index.html`

The generated page URL, if deployed to GitHub Pages, would be:

- `https://tonochan.github.io/supernova/static-replays-hybrid/TLlUZkSDP0ACY1Z0/`

The generated page's `og:image` points to a different origin:

- `https://raw.githubusercontent.com/tonochan/supernova/974d1568fba8c2b6c923d97be0903317dc72872d/static-replays/TLlUZkSDP0ACY1Z0/og.png`
