# DeepSurfCut website

Product website for `https://deepsurf.app`, with a small Cloudflare Pages Function
for Apple's Retention Messaging API.

## Local preview

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173` for English or `http://localhost:4173/zh/` for
Simplified Chinese. This command previews only the static website. To run the
retention endpoints as well, use Node.js 22 or later:

```bash
npm ci
cp .dev.vars.example .dev.vars
npm run dev
```

The API preview uses Cloudflare's local runtime. Message configuration is optional
for starting the server; an unconfigured endpoint cannot return a successful
retention response. See [Retention messaging](docs/retention-messaging.md).

## Cloudflare Pages

- Framework preset: `None`
- Build command: `npm run build`
- Build output directory: `dist`
- Node.js: `22` or later

Update the existing Pages build settings to these values before deploying this
change. Confirm the project name in `wrangler.jsonc` matches the existing Pages
project. The configuration supplies the output directory and runtime compatibility
settings; Pages compiles the root `functions/` directory during deployment.

The build copies the website into `dist/`, excluding server source, dependencies,
tests, and local configuration from public assets. `_routes.json` limits Function
invocations to `/api/retention` and its children. Cloudflare Pages automatically
deploys the `main` branch to production and creates preview deployments for other
branches.

## Validation

```bash
npm test
npm run test:runtime
```

Tests require OpenSSL (available on macOS and standard Linux development systems).
They generate temporary certificate chains, exercise Apple's actual verifier,
and check the compiled Functions inside the Cloudflare runtime. Runtime tests use
local ports and write Wrangler logs; they do not deploy or call the Apple API.

Passing local tests does not replace Apple's required sandbox performance test.

## Search visibility

The 21 primary product pages use static, crawlable HTML, self-canonical URLs, reciprocal
English/Simplified Chinese/German language links, descriptive metadata, and linked
WebSite/WebPage/SoftwareApplication structured data. The sitemap lists only these
canonical pages. Keep its `lastmod` dates tied to substantive content changes,
not build dates. No prices or ratings are invented for search features.

Run `npm run test:seo` after page changes. `npm test` includes these checks alongside
the existing API tests. The runtime suite verifies missing-page 404 responses.

See [SEO operations](docs/seo.md) for the audit, deployment checks, and the
account-level Search Console and domain-redirect setup that remains separate
from the website source.

The Portrait Follow tutorial lives at `/portrait-follow/`, `/zh/portrait-follow/`,
and `/de/portrait-follow/`. Keep its shared section IDs aligned so language switches
preserve deep links. Real source/export videos use native controls and do not preload.
Homepage, support, editing-guide and relevant generated release entries link to it.

The site loads a small, local Lucide subset from `assets/icons-20261015.js`.
After adding an icon, run `node scripts/build-icons.mjs`; both the build and tests
reject a stale subset. Keep the original vendored library and license for rebuilds
and cached pages. Performance tests exercise deferred autoplay and explicit playback
under reduced-motion and constrained-network preferences; they are not a field
Core Web Vitals measurement.

## App update history

Release history lives at `/updates/` and `/zh/updates/`, with separate iOS and
macOS histories. Approved bilingual copy and source release timestamps live in
`content/releases.json`. This file is not copied into the public build.

After a verified public marketing-version release, update that platform's entry,
set the content update date, run `npm run updates:generate`, and update the two
sitemap dates. Build-only changes do not create another entry. `npm test` checks
the data, generated pages, and SEO; `npm run build` rejects stale generated pages.
Both histories remain readable without JavaScript. See `AGENTS.md` for the
publication and maintenance rules.

## UI and motion

The bilingual homepage uses `home.css` and `home.js`. The policy and support pages
share that visual system with scoped typography in `legal.css`.

The session-sorting illustration is user-triggered and respects reduced motion.
Hero playback pauses offscreen and includes a manual pause control.

## Device mockups

The homepage uses Space Black iPhone Air mockups rendered from Apple's official
[Product Bezel](https://developer.apple.com/design/resources/) resource under the
Apple Design Resources License. The existing finished mockup supplies the bezel;
real app captures sit over its measured screen area in HTML/CSS. The standalone
Apple bezel template is not redistributed in this repository.

## App screenshots

The homepage's Portrait Follow comparison uses the first 18 seconds of the
original Test2_Short recording and the matching Test2Short_surfer1_full_portrait
app export. The portrait framing is already in the exported video. Both clips
are converted from HDR to SDR and encoded as H.264 for the web, with matching
30 fps timelines. The original provides the shared audio; the portrait web copy
is silent to prevent doubled sound. Posters come from each video's first frame.
The shared controls synchronize playback, seeking, buffering, and replay. Native
video controls remain available without JavaScript. The phone screenshots retain
the genuine iPhone Air bezel.

The moving crop outline uses 540 frame positions measured by matching the actual
portrait export to the original recording. This export crops native 1080 x 1920
pixels from a 3840 x 2160 source, including small vertical changes. The outline
uses the displayed source frame's timestamp and also updates after paused seeks.
The export plays inside the same Space Black iPhone Air bezel, with the entire
9:16 picture visible and the original bezel's camera island retained.

The September 12 asset refresh uses genuine captures from the maintained App Store
screenshot project, optimized as versioned WebP files for the website:

- iPhone: rider timeline, export settings, and completed export saved to Photos.
- Mac: the existing full workspace, plus the real export panel.
- iPad (archived, not displayed): a September 12 timeline-detail capture with a
  selected ride. The homepage keeps the iPad support description without repeating
  the timeline already visible in the Mac workspace. The HDR video preview is not used.

The iPhone and Mac captures are from app version 0.13.0 (18); the new iPad detail
is from 0.12.0 (17). The September 12 package reuses earlier iPhone and Mac captures.
Original app UI remains in English on both language versions of the website.
No controls, results, or translations are painted into the captures.

Lucide icons are distributed locally; their license is in `assets/lucide.LICENSE.txt`.
