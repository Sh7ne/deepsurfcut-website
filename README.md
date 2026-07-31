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
