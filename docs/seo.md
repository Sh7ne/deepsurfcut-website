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

## October 26, 2026 Rapid Surfing terminology

The three homepages, editing guides and support pages now include Rapid Surfing
as a term for surfing natural or artificial standing waves. The editing guides
also cover it in their titles, descriptions and matching social/structured data.
German copy includes Rapidsurfen. The guides share a `#rapid-surfing` section;
localized support answers link directly to that explanation.

Fixed-camera deep-water standing-wave sessions remain the main product use case.
Other recordings still require a representative check, and FlowRider/flowboarding
retains its separate explanation. No new URLs or release-history entries were
created. Sitemap modification dates change only for the nine edited pages.

Terminology evidence:
- [Rapid Surf League: definition of Rapid Surfing](https://rapidsurfleague.com/rapid-surfing/)
- [Citywave: standing-wave technology](https://citywave.de/technology/)

## November 12, 2026 Rapid Surf Map search visibility

The map keeps its unified `/RapidSurfingMap` entry and country-based default,
while its four explicit region/language views now have stable self-canonicals:
`?region=china`, `?region=europe`, `?region=europe&lang=de`, and
`?region=north-america`. Previously every view pointed at the unqualified entry,
which could consolidate distinct directories and translations into one page.
Canonical, Open Graph, CollectionPage identity and sitemap now agree. Only the
equivalent European English/German directories use reciprocal hreflang, with
English as x-default. Regional directories are not treated as translations.
The sitemap contains 25 canonical URLs: 21 product pages and four map views.

Titles and visible map identity cover Rapid Surf Map, Rapid Surfing and
Rapidsurfen naturally. The native, keyboard-accessible map guide explains the
sport, this directory's narrower scope, search/filter/navigation features, source
dates and position accuracy. It remains in the original HTML and readable without
JavaScript. All three editing guides and support pages link to the relevant
map view, and each map links to its localized editing and Portrait Follow guides.

CollectionPage/ItemList markup retains the actual venue count and links to real
listing anchors, with descriptions matching the visible summaries. No venue
verification date, coordinate accuracy or business claim changes with this copy
update. The page modification date uses UTC and is separate from check dates.
Existing reviewed venues, operator sources, contact information and photo credits
are preserved. No live status, exhaustive coverage, ranking or AI citation is
promised.

This follows ordinary crawlability, content and localization practices for both
search and generative answers. Google does not require a special AI file or
special schema for its generative search features. Keep the existing submitted
sitemap URL; after deployment, Search Console can inspect the four stable views
to monitor Google's selected canonical and indexing, then query performance.
Publishing the sitemap does not establish that Google has processed these URLs.

Primary guidance:
- [Google: managing multilingual and multi-regional sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)
- [Google: localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [Google: AI features and websites](https://developers.google.com/search/docs/appearance/ai-features)
- [Rapid Surf League: terminology](https://rapidsurfleague.com/rapid-surfing/)

## November 14, 2026 Rapid Surf Map venue discovery

The directory now gives each reviewed venue a static information URL, rather
than treating a map fragment as a separate search page. The 32 existing venues
produce 46 localized pages: 11 Chinese, 21 English and 14 German. They retain
reviewed descriptions, addresses, source dates, operator links, contact ownership,
position-accuracy notes, and photo credits. No new venue facts, live availability,
prices or ratings are introduced. The purpose is a useful venue record with a
stable search/share destination, not a collection of city-keyword landing pages.

The map's existing card anchors point at these real URLs. Ordinary enhanced clicks
still open the map dialog; modified clicks and no-JavaScript use follow the links.
Dialogs also provide a visible information-page link. New shares use the venue
page, with the existing hash URL retained as a compatibility fallback for cached
configuration. Each information page returns to the correct region/language and
selected marker. Existing incoming map fragments still work.

Each page has a unique venue/city title, matching social metadata, self-canonical,
visible breadcrumb and corresponding BreadcrumbList, WebPage and Place entities.
The equivalent European translations use reciprocal hreflang and a shared venue
entity ID. The collection ItemList now links to the real venue pages and those
same Place entities. Approximate or site pins are not promoted to exact coordinates,
and park reception numbers are not marked as a venue's direct line.

A dedicated map-themed 1200 × 630 PNG replaces the app-editor screenshot on map
and venue shares. It identifies Rapid Surf Map and its standing-wave scope without
pretending that abstract artwork is a real map or venue photo. Chinese and German
homepage map links preserve their corresponding map language; the general English
entry retains country-based selection.

The sitemap now has 71 canonical URLs: 21 product pages, four explicit map views,
and 46 venue pages. The venue generator maintains its own entries and the four
map modification dates while preserving unrelated product entries. Page
modification dates remain distinct from the underlying venue check dates. The
sitemap URL stays unchanged; this update does not submit it to search tools or
establish indexing, search position, traffic growth, or rich-result eligibility.

Primary guidance:
- [Google: URL structure and fragments](https://developers.google.com/search/docs/crawling-indexing/url-structure)
- [Google: crawlable links](https://developers.google.com/search/docs/crawling-indexing/links-crawlable)
- [Google: JavaScript and interaction-dependent content](https://developers.google.com/search/docs/crawling-indexing/javascript/lazy-loading)
- [Google: structured-data accuracy](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)
- [Google: localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [Google: sitemap lastmod](https://developers.google.com/search/blog/2023/06/sitemaps-lastmod-ping)
