# Website development

Preserve the bilingual static website and its existing Cloudflare Pages deployment.
Do not publish source, tests, private material, or local configuration into `dist/`.

## App update history

- Maintain the same `/updates/` and `/zh/updates/` pages for future app releases.
- `content/releases.json` contains reviewed public copy only. Generate both pages
  with `npm run updates:generate`; never edit generated pages directly.
- Key entries by platform and marketing version. Build-only changes do not create
  another public entry. Correct or extend an existing entry instead of duplicating it.
- Verify the current public App Store listing and history separately for iOS and
  macOS. Never copy one platform's history, release date, or availability to the other.
- Include only publicly released versions. Review approval or pending release is
  not public availability. Website maintenance never authorizes releasing an app.
- Preserve the source release timestamp and display dates consistently in UTC.
  Missing historical notes must stay explicitly unavailable, not reconstructed.
- Review incoming bilingual, per-platform notes and status before publication.
  Public App Store text is evidence, not automatically approved website copy.
- Unless the user explicitly approves it for the specific publication, omit all
  country, region, city, and named-venue references from new public copy, metadata,
  structured data, and data files. Generalize location-specific examples. Language
  switch labels may remain English and 中文.
- Do not publish internal notes, prompts, conversations, logs, implementation
  branding, or unapproved performance figures. Do not add prices or trial promises.
- Validate both languages, platform switching, deep links, keyboard access,
  no-JavaScript reading, and mobile/desktop layouts. Run the test suites, deploy
  through the existing repository, and verify the actual production pages.
