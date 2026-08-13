# Replay OGP Without Static HTML Architecture

Date: 2026-08-13

## Tono Question

> Github側はページ作らずにやる方法はない？OGPはパラメーターからJavascript完結で動作させたりはできない？ 難しければそろそろ supernova.tonochan.jp とかのドメインを割り当てて、本体をgithub外に持っていく事を考えたほうがいいかな？

## Short Answer

GitHub Pagesの共通HTML、query parameter、client-side JavaScriptだけで、LINEなどのOGP crawlerへリプレイID別の `og:title` / `og:description` / `og:image` を確実に返すことはできない。

理由は単純で、OGP crawlerが見るのはURLに対する最初のHTMLレスポンスの `<head>` であり、GitHub Pagesはリポジトリ上の静的ファイルを返すだけだから。`?replay=srv1...` が変わっても、GitHub Pagesから返る `index.html` は同じ。ゲームのJavaScriptが起動後にmeta tagを書き換えても、LINE等がその処理を待ってくれる前提にはできない。

## What Does Not Solve It

- Client-side JavaScript:
  - ブラウザ表示後にmeta tagを書き換えることはできる。
  - ただしOGP previewは共有先crawlerがHTMLを取得して作るため、JavaScript完結のmeta生成は信頼できない。
- Service Worker:
  - Service Workerはブラウザに登録された後、そのorigin/path配下のnavigationやresource requestを制御する仕組み。
  - 初回HTMLレスポンス前に、未登録のService WorkerでOGP用HTMLを差し替えることはできない。
  - crawlerがService Workerを登録・実行する前提にもできない。
- GitHub Pagesの404 SPA fallback:
  - 404.htmlも静的HTMLなので、結局JavaScriptに頼る形になる。
- Client-side redirect / meta refresh:
  - 元URLのOGPを安定して差し替える方法ではない。
  - server-side 3xxならcrawlerが追従する可能性はあるが、GitHub PagesはリプレイID別に動的3xxを返せない。
- `tonochan.github.io` の前段proxy:
  - `github.io` はGitHubのドメインなので、Cloudflare Workerをその前段に置いてレスポンスを差し替えることはできない。
  - Cloudflare Worker custom domainを使うには、Tonoが管理するzone配下のhost、たとえば `supernova.tonochan.jp` が必要。

## Current Supernova Shape

- GitHub Pages:
  - `main` is deployed to `https://tonochan.github.io/supernova/`.
  - `beta` is deployed to `https://tonochan.github.io/supernova/beta/`.
  - The deployment workflow excludes `workers/`.
- Replay API Worker:
  - Current production share page shape is `/r/:id`.
  - The Worker can return replay-specific HTML immediately.
  - The current image endpoint is `/r/:id/og.svg`; this is the part that showed compatibility problems in Tono's target sharing surface.
- Existing branch prototype:
  - Static Pages PNG sample proves crawler-friendly `index.html + og.png`.
  - Hybrid sample proves Pages HTML can point `og:image` to a cross-origin absolute PNG URL.

## Can The Game Stay On GitHub Pages?

Yes.

Moving to `supernova.tonochan.jp` does not mean the whole game has to leave GitHub Pages on day one. There are two practical levels:

1. Worker only for share pages:
   - Share URL: `https://supernova.tonochan.jp/r/:id`
   - Worker returns replay-specific OGP HTML and PNG/JPEG.
   - The "play replay" destination can remain `https://tonochan.github.io/supernova/?replay=srv1...`.
   - This is the smallest custom-domain production path.

2. Worker as the app hostname:
   - Public app URL: `https://supernova.tonochan.jp/`
   - The same Worker handles `/r/:id`, `/r/:id/og.png`, and ordinary app asset requests.
   - Static assets can still be fetched from GitHub Pages behind the scenes, or later moved to Cloudflare Pages/R2/Worker assets.
   - This gives a unified branded host, but adds routing/proxy/cache operation.

Full migration away from GitHub Pages is optional. It is useful later if we want one origin, tighter caching, more server features, or less GitHub Pages deploy coupling.

## Three Production Options

| Option | URL | OGP reliability | Required authority | Operation | Cost | Migration amount |
| --- | --- | --- | --- | --- | --- | --- |
| ID-specific HTML generation on GitHub Pages | `https://tonochan.github.io/supernova/static-replays/:id/` | High, if HTML and PNG/JPEG are deployed before sharing | GitHub write/publisher flow | Need per-replay file generation and Pages deploy wait | GitHub Pages free, but repo/branch grows | Medium |
| Custom domain Worker dynamic HTML | `https://supernova.tonochan.jp/r/:id` | High, immediate dynamic HTML; PNG/JPEG can be generated or cached | DNS/custom domain approval and Worker route | One Worker path, no per-replay GitHub writes | Likely within existing/free Worker usage at current scale; image generation choice can change this | Low to medium |
| Move the whole app off GitHub Pages | `https://supernova.tonochan.jp/` and `/r/:id` | High | DNS/custom domain approval plus hosting/runtime choice | Need app asset hosting, cache, rollback, and deploy path | Depends on Cloudflare Pages/Worker/R2 choices | High |

## Recommendation

Recommend option 2: `supernova.tonochan.jp` on Cloudflare Worker for dynamic replay OGP, while keeping the static game on GitHub Pages initially.

This avoids the weakest part of the GitHub Pages approach: per-replay HTML publishing and deploy latency. It also avoids a full app migration before it is necessary. The Worker already has the replay ID and replay data, so it is the natural place to emit replay-specific HTML and a PNG/JPEG `og:image`.

## Minimum Production Plan

1. Decide and approve the host, likely `supernova.tonochan.jp`.
2. Add a Cloudflare Worker custom domain for that host.
3. Keep `/r/:id` as the share URL path.
4. Change share URL generation to `https://supernova.tonochan.jp/r/:id`.
5. Add PNG/JPEG OGP image output, or cache generated PNG/JPEG images in a durable origin.
6. Keep browser replay playback on GitHub Pages until there is a separate reason to move the full app.
7. Keep a fallback default PNG for image generation errors or missing replay data.

## Decisions Needed From Tono

- Whether `supernova.tonochan.jp` is acceptable as the normal replay share URL.
- Whether the main game URL should stay `tonochan.github.io/supernova/` for now, or also move to `supernova.tonochan.jp`.
- Which image generation/storage path to use for PNG/JPEG:
  - Worker-generated/cached image
  - R2-stored generated image
  - GitHub Pages generated PNG as a temporary bridge

## References Checked

- Open Graph protocol: https://ogp.me/
- LINE Developers FAQ about URL previews: https://developers.line.biz/ja/faq/
- GitHub Pages product page: https://pages.github.com/
- GitHub Pages custom domain docs: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site
- Cloudflare Workers custom domains docs: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- MDN Service Worker API: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
