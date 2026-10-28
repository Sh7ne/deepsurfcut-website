# Venue map maintenance

The map is published through the existing `Sh7ne/deepsurfcut-website` repository
and Cloudflare Pages project. Its only page is Chinese, at `/RapidSurfingMap`
without a trailing slash, generated as the root `RapidSurfingMap.html`. The
Chinese homepage footer has one unobtrusive entry. English and German homepages
have no map entry, and the map has no language switch. The map's header links back
to `/zh/`; its provider-attribution footer remains visible. Existing links to
`/venues/`, `/zh/venues/`, and `/de/venues/` redirect permanently to the single page.

## Data and generated pages

`content/venues.json` is the reviewed public source. The initial directory contains
11 physical venues, including three seasonal outdoor venues. It excludes closed,
unverified, non-deep-water, and natural-river entries from the earlier research.
Do not claim that this is a live or exhaustive list of all operating venues.

After reviewing a change:

1. Update the existing stable venue ID, copy, address, source URLs, and source date.
2. Preserve the distinction between a venue position, a containing site position,
   and an approximate position. An address or nearby park point does not verify
   the exact entrance. Never silently upgrade position accuracy.
3. Keep seasonal schedules independent per venue. An approximate operating season
   does not establish whether the venue is open on a particular day.
4. Run `npm run venues:generate`, then `npm test` and `npm run build`.
5. Verify search, filters, saved venues, map/list selection, links, share URLs,
   denied/unavailable geolocation, unavailable tiles, keyboard use, reduced motion,
   no-JavaScript content, and iPhone/desktop layouts before publication.

`npm run test:venues-browser` also checks that ordinary clicks preserve the mobile
panel position, selected venues remain visible above the panel after animation,
and closing a detail returns keyboard focus to its map marker. Opening and closing
details must not accumulate empty browser-history entries. The location button
centers the visitor's position even when the saved list is empty. Empty results
and their reset button belong inside the scrollable list so they remain reachable
on small screens.

`scripts/render-venues.mjs` owns `RapidSurfingMap.html` and `venues/data.json`.
Shared JavaScript, CSS, and provider assets remain under `venues/`; the three old
locale `venues/index.html` files must remain absent. Canonical metadata and shared
venue links use `https://deepsurf.app/RapidSurfingMap`, with the venue hash appended.
The build checks generated output against the source. Public assets are copied
through the existing allowlist; source data, research, scripts, tests, and local
configuration remain outside `dist/`.

## Map providers and local configuration

The map currently prioritizes Baidu JavaScript API 4.0, with a locally vendored
Leaflet 1.9.4 client and OpenStreetMap tiles as an alternative. Amap JS API 2.0 is
retained but paused until quota is available and it is explicitly enabled.
The browser remembers a successful
provider choice. Without a saved choice, it selects configured Baidu, then configured
Amap, then OpenStreetMap. Provider changes retain the directory filters, saved
venues, selected venue, and any location already shared by the visitor. Only the
selected provider's SDK is loaded; the directory and external navigation links
remain usable when a provider cannot load.

Use Node.js 22 or later and `npm run dev` for a full local preview. Copy
`.dev.vars.example` to the ignored `.dev.vars` file if it does not already exist,
then configure these values without committing them:

| Variable | Purpose |
| --- | --- |
| `BAIDU_MAP_AK` | Baidu browser JavaScript API key |
| `AMAP_MAP_ENABLED` | Opt-in switch: only `true` enables Amap; omitted or `false` keeps it paused |
| `AMAP_MAP_KEY` | Amap browser JavaScript API key |
| `AMAP_SECURITY_JSCODE` | Amap security code, available only to the server |

`GET /api/maps/config` returns enabled providers' browser keys and availability.
Browser keys are necessarily visible in browser requests; configure the appropriate
JavaScript application and allowed website domains in each provider's console.
Amap is enabled only when `AMAP_MAP_ENABLED=true` and both its browser key and
server security code are set. While paused, config returns an empty Amap key and
the proxy returns `503 map_service_disabled` without contacting Amap. Keep the
switch off while its quota is unavailable; setting credentials alone does not
resume it. Restart the local preview after changing the switch.
Baidu needs its browser key. A plain static server has no configuration endpoint,
so it offers OpenStreetMap while preserving the full static directory.

`npm run dev -- --port 4173` builds the site, copies the public `dist/` assets to
ignored `.wrangler/preview-assets/`, and starts Wrangler on `127.0.0.1`. Baidu's
worker chooses HTTP resources on an HTTP localhost page. The preview copy adds
only `http://api.map.baidu.com` and `http://*.bdimg.com` to `script-src` and
`connect-src` for `/RapidSurfingMap`, matching its existing HTTPS origins.
This exception is local-only: source `_headers` and production `dist/_headers`
keep their HTTPS allowlist. Logs stay under `.wrangler/logs/`, telemetry is disabled,
and private configuration is never copied into the preview assets. Restart
`npm run dev` after changing source assets or policies to refresh the local copy.

The Amap adapter sets `_AMapSecurityConfig.serviceHost` to the same-origin
`/api/maps/amap/_AMapService` endpoint before loading the SDK. The `/_AMapService`
suffix is part of the configured host. The Cloudflare Pages Function appends the
configured key and security code on the server. It accepts same-origin GET requests
only, bounds request and response sizes, and allows these fixed upstream paths:

| Proxy path after `/_AMapService` | Upstream origin |
| --- | --- |
| `/v4/maps` | `https://restapi.amap.com` |
| `/v4/map/styles` | `https://webapi.amap.com` |
| `/v3/assistant/coordinate/convert` | `https://restapi.amap.com` |

This is not a general map-service proxy. Additional SDK features need an explicit
endpoint review. Config and proxy responses use `Cache-Control: no-store`; upstream
errors and credentials are not reflected to the browser. Never place the security
code in generated HTML, public JavaScript, `venues/data.json`, or client storage.
Configure production variables separately in the existing Pages project before a
future deployment. This provider integration has only been prepared locally; it
does not by itself configure or publish the production site.

OpenStreetMap requests ordinary tiles from
`https://tile.openstreetmap.org/{z}/{x}/{y}.png` without an API key. Preserve each
provider's attribution and the browser Referer. For OpenStreetMap, use normal
browser caching; do not add prefetch, tile downloads, offline maps, or a tile-caching
service worker. Its public tile service has no availability guarantee. Access and
speed for every provider depend on the network and provider configuration.

## Coordinates

Public positions and the common adapter interface use WGS84, ordered as
`[latitude, longitude]`. Amap uses its official `AMap.convertFrom(..., 'gps', ...)`
conversion to GCJ-02; Baidu uses `BMap.Convertor.translate(..., 1, 5, ...)` to BD-09.
Conversions happen before placing or projecting a point, are cached only for the
current provider instance, and do not rewrite the public dataset. Leaflet uses
the WGS84 values directly. Do not mix WGS84, GCJ-02, and BD-09, or substitute an
unverified coordinate formula. Data obtained in another coordinate system must
be reviewed and normalized before publication, with provenance retained in
research documentation. For approximate/site-level positions, use a venue-name
search for final navigation rather than implying an exact entrance.

Official references:

- [Leaflet downloads](https://leafletjs.com/download.html)
- [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
- [Amap JavaScript API security proxy](https://lbs.amap.com/api/javascript-api-v2/guide/abc/jscode)
- [Amap coordinate conversion](https://developer.amap.com/api/webservice/guide/api/convert)
- [Baidu JavaScript API 4.0](https://lbs.baidu.com/docs/jsapi?title=jsapi4/index)
- [Amap marker URI API](https://developer.amap.com/api/uri-api/guide/mobile-web/point)
- [Baidu Web URI API](https://lbsyun.baidu.com/docs/webapi?title=mapadjustment/uri/web)
- [Apple Maps URLs](https://developer.apple.com/documentation/mapkit/unified-map-urls)

## Browser policy and privacy

Baidu's original copyright, filing links, and logo are kept in a compact footer
at the bottom of the page. The adapter moves the original SDK nodes and restores
them before retry or destruction. The footer's measured height keeps mobile tabs
and venue lists clear of it; do not replace the text with a hard-coded copy.

Map pages allow the selected providers' JavaScript, tile, and supporting resource
origins in `_headers`, including the exact OpenStreetMap tile origin. They allow
the inline styles and blob workers required by the SDKs. Baidu 4.0's official
`_jsload` / `_evalModuleCode` module loader evaluates the downloaded modules, so
`unsafe-eval` is permitted only on `/RapidSurfingMap`. Inline scripts remain
blocked, and the rest of the site keeps its existing strict policy.
The route-specific `_headers` rules first detach the inherited CSP and Permissions
Policy, then replace them. Cloudflare otherwise combines matching header values.
The venue policy upgrades document requests to HTTPS. Baidu's worker imports on
HTTP localhost need the separate, local-only preview policy described above.
Restart Wrangler after changing `_headers`; rebuilding assets alone does not
necessarily replace the running preview's header policy.
Check the final production response after a deployment; a second inherited CSP
would prevent provider resources from loading.

Geolocation is allowed only on the map page and must be requested after an
explicit user action. Favorites and the selected map provider are stored in the
current browser. The visitor's location stays in page memory for distance sorting
and map placement; it is not saved to local storage or an application database.
When a location is placed on Amap or Baidu, official coordinate conversion sends
that point to the selected provider. Amap conversion passes through the same-origin
proxy, which does not persist or log request coordinates. Switching providers
after sharing a location can send it for the new provider's conversion. Do not
claim that precise coordinates never leave the browser.

Map resources and coordinate conversions make requests to the selected provider;
navigation links open the provider chosen by the visitor. Do not add analytics or
logging of precise coordinates, conversion URLs, or favorite selections.

[Cloudflare custom headers](https://developers.cloudflare.com/pages/configuration/headers/)
