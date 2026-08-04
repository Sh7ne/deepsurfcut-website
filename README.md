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

## Device mockups

The iPhone 17 Pro mockups are rendered from Apple's official
[Product Bezel](https://developer.apple.com/design/resources/) resource under the
Apple Design Resources License. Only the finished DeepSurfCut UI mockups are included;
the standalone Apple bezel template is not redistributed in this repository.
