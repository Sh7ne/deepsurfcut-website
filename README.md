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
