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
Apple Design Resources License. Only the finished DeepSurfCut UI mockups are included;
the standalone Apple bezel template is not redistributed in this repository.

The Mac workspace image is an actual DeepSurfCut application screenshot.
Lucide icons are distributed locally; their license is in `assets/lucide.LICENSE.txt`.
