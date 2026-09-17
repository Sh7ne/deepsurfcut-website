# Search visibility

## September 17, 2026 audit

The original site already had static HTML content, unique descriptions, one H1
per page, correct self-canonical URLs, reciprocal language alternatives, a
robots file, and a sitemap. The search titles described a slogan rather than the
product category. Unknown URLs returned a 200 copy of the homepage because
Cloudflare Pages used its default single-page-app fallback.

The current implementation adds descriptive bilingual search titles, complete
social metadata with a genuine Mac screenshot, site/app/page identity in JSON-LD,
useful filming and editing support copy, a contextual support link, and localized
404 pages. The published 404 file disables the homepage fallback. Device previews
and Pages-hosted duplicate/preview domains are marked noindex; API routes are
excluded from robots crawling without changing their application routing.

The homepage retains its brand H1 and existing layout. Small 128px brand artwork
replaces the 708 KiB original in the page; the hero poster is an optimized WebP
preloaded at high priority. Original files remain for older cached pages.

## Editorial constraints

- Describe fixed-camera deep-water standing-wave footage, not generic ocean-surf
  tracking, action scoring, or automatic selection of the best maneuvers.
- Use the user's established Chinese term for this sport in Chinese content.
- Keep the app's English UI intact inside genuine screenshots.
- Keep prices, ratings, and invented endorsements out of markup as well as copy.
- SoftwareApplication describes the app; it does not claim eligibility for a
  price/rating-rich search result. Those features have additional requirements.
- Do not add hidden keyword blocks, doorway pages, or FAQ rich-result promises.
- Change sitemap `lastmod` only after substantive page changes. Legal pages omit
  it rather than presenting metadata-only updates as a new policy revision.

## Account-level follow-through

These steps require the owner's external accounts and are not completed by a Git
deployment. The source does not contain fabricated verification tokens.

1. In Google Search Console, verify the `deepsurf.app` domain property using the
   TXT record issued to the owner's account. A URL-prefix property and its supplied
   verification file/meta tag are alternatives. Confirm any existing property
   before creating another one.
2. Submit `https://deepsurf.app/sitemap.xml`. Inspect `/`, `/zh/`, `/support/`, and
   `/zh/support/`, then request indexing for the updated pages. Check selected
   canonicals, indexing exclusions, impressions, clicks, and Core Web Vitals after
   real crawling and field data arrive. A deployment is not proof of indexing.
3. In Cloudflare, set a permanent redirect from `www.deepsurf.app` to
   `https://deepsurf.app`, preserving paths and query strings. The audit found www
   still serving 200 with the correct apex canonical. Do not broaden Pages Function
   routing just to implement this, and do not redirect Apple's retention endpoints
   without checking their separately configured callback URLs.
4. Bing Webmaster Tools can import the verified Search Console property or verify
   ownership separately and receive the same sitemap. No account submission is
   implied by publishing robots.txt.

Wrangler reported no authenticated Cloudflare account in this task. Existing Git
integration remains the deployment mechanism. No Search Console property was
accessed or changed during this source update.

## Checks

```sh
npm run test:seo
npm test
npm run test:runtime
npm run build
```

After deployment, check the real origin (not just localhost): all sitemap URLs
must return 200; unknown English and Chinese paths must return 404; scripts and
images must load; canonical and alternate URLs must be absolute and reciprocal.
Public canonical pages must not receive an HTTP or HTML noindex directive.
The Pages hostname and device preview should receive noindex. Check HTTPS and
directory redirects, and verify neither markup nor assets include pricing or
internal implementation/model branding.

## Primary references

- [Google: descriptive title links](https://developers.google.com/search/docs/appearance/title-link)
- [Google: snippets and descriptions](https://developers.google.com/search/docs/appearance/snippet)
- [Google: localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [Google: site names](https://developers.google.com/search/docs/appearance/site-names)
- [Google: software application structured data](https://developers.google.com/search/docs/appearance/structured-data/software-app)
- [Google: sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google: documentation updates](https://developers.google.com/search/updates)
- [Cloudflare: 404 behavior](https://developers.cloudflare.com/pages/configuration/serving-pages/)
- [Cloudflare: hostname-specific noindex headers](https://developers.cloudflare.com/pages/configuration/headers/)
