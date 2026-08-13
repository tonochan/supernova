# Replay OGP PNG Options

Date: 2026-08-13

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

### A. Keep Worker share URL, change dynamic image to PNG or JPEG

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

### B. GitHub Pages pre-generated replay pages

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

### C. Custom domain routed to Worker

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
