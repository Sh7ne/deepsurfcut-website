# DeepSurfCut website

Static product website for `https://deepsurf.app`.

## Local preview

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173` for English or `http://localhost:4173/zh/` for
Simplified Chinese.

## Cloudflare Pages

- Framework preset: `None`
- Build command: leave empty
- Build output directory: `.`

The repository is intentionally build-free. Cloudflare Pages automatically deploys
the `main` branch to production and creates preview deployments for other branches.

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
