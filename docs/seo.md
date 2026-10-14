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

- Keep fixed-camera deep-water standing-wave sessions as the primary use case.
  Include FlowRider/flowboarding and other surfing footage as compatible use cases
  with recording-dependent results; do not promise identical tracking performance,
  action scoring, or automatic selection of the best maneuvers.
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

## October 14, 2026 multilingual expansion

The product site now has complete English, Simplified Chinese and German versions
of the homepage, support, privacy, terms, updates and surf-video-editing guide:
18 indexable URLs in six reciprocal language groups. German release notes translate
the existing, independently verified iOS/macOS public histories without adding
versions or reconstructing unavailable notes. Screenshots retain the real app UI.

Every group uses a self-canonical URL, en/zh-Hans/de/x-default alternates, localized
titles/descriptions and social text, and matching sitemap alternatives. Language
menus work without JavaScript and retain section/version fragments when enhanced.
There is no forced language redirect. German targets the language, not a country.

The surf-video-editing guide answers real recording and export questions, has
visible breadcrumbs matching its BreadcrumbList entity, and is linked from the
homepage and support. FlowRider is included as a compatible use case rather than
excluded; its flowboarding vocabulary is distinguished from deep-water standing
waves. Ocean and other artificial-wave footage is discussed without promising
uniform automated results. These are three translations of one substantial guide,
not keyword-swapped doorway pages. No FAQ search appearance or ranking is promised.

Indexing still needs real crawling. Add /de/ and all three surf-video-editing URLs
to the Search Console inspection workflow above, submit the expanded sitemap,
and monitor queries by page and language. Publishing is not account verification
or a Search Console submission. German legal pages translate the existing policy;
this source update is not a legal compliance audit.

Terminology references (no venue/location examples are published in site copy):
- [FlowRider official product and flowboarding information](https://www.flowrider.com/)
- [Citywave official standing-wave terminology](https://citywave.de/)

Regression checks cover all 18 pages, three-language canonical/alternate/sitemap
parity, static translated body content, contextual FlowRider coverage, real images,
language menus, release-history isolation, Portrait Follow media and crop data.
Runtime checks include German public pages and unknown German paths returning 404.

## October 15, 2026 performance and tutorial update

The three Portrait Follow tutorials add step-by-step, static instructions at
`/portrait-follow/`, `/zh/portrait-follow/` and `/de/portrait-follow/`. The sitemap
and SEO checks now cover 21 URLs. Each tutorial preserves shared section IDs,
reciprocal language links and visible breadcrumbs; source and exported videos use
native controls with `preload="none"`. Homepage, support, editing-guide and relevant
generated release entries link to the localized tutorial. Release facts and
timestamps are unchanged.

The public icon bundle contains only the 27 used Lucide glyphs. Local gzip size
falls from 93,324 to 2,047 bytes (the uncompressed files are 397,450 and 6,135
bytes). This is a resource-size comparison, not a measured Core Web Vitals gain.
The hero waits for initial loading and painting before autoplay; reduced motion,
data saving and slow connections avoid automatic video playback/downloads.
Deliberate playback remains available. Offscreen Portrait Follow crop data is
deferred, and data saving no longer preloads the two demonstration videos.
Run `node scripts/build-icons.mjs` after adding icons. Build and test checks reject
a stale bundle. The full licensed library remains available for regeneration and
cached older pages.

### WWW redirect

Cloudflare Single Redirect `Redirect www to deepsurf.app (website only)` is active.
This is a zone-level rule, independent of the repository's Pages deployment:

```text
Match: (http.host eq "www.deepsurf.app" and not (http.request.uri.path eq "/api" or starts_with(http.request.uri.path, "/api/")))
Target: concat("https://deepsurf.app", http.request.uri.path)
Status: 301
Preserve query string: enabled
```

The API namespace is excluded so Apple's existing callbacks are not redirected.
Pages Function routes remain restricted to the retention API. Cloudflare Pages
`_redirects` does not support domain matching, so the rule is maintained in the
domain's Redirect Rules dashboard. Production checks must include both HTTP and
HTTPS www URLs, nested language paths, query strings, the apex and the API.

Search Console account verification, submission and real-user performance data
still require separate account-level follow-through.
