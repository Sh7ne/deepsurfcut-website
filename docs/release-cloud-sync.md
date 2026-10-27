# Cloud release synchronization

The maintained workflow is `.github/workflows/sync-app-store.yml` in the public
website repository. It runs on GitHub-hosted Ubuntu runners, not on the owner's
computer. The first real cloud run, bot-commit Cloudflare deployment and production
browser checks passed on 2026-10-27. The desktop follow-up has been removed.

## Publication contract

- Check the actual public iOS and macOS histories independently every hour.
- A completed Xcode Cloud build is only a wake-up signal. Neither a build,
  TestFlight nor review approval is a public release date.
- Reuse the app's maintained English, Simplified Chinese and German App Store
  release copy. The German storefront URL is necessary: requesting German on the
  default storefront can silently return English. Reject that fallback.
- Validate app identity, marketing versions, history order, exact per-platform
  timestamps, matching localized versions/dates, translated body text and matching
  note structure. Screen public copy before import; do not execute it as code.
- Reject internal paths/status, restricted branding, commercial claims,
  unapproved performance figures and recognized geographic/venue references.
  These conservative rules are not a general semantic/NER audit. Ambiguous copy
  must stop for editorial review, not be silently generalized or invented.
- All six public pages must be readable and valid before a publication is planned.
  Localization/store propagation can defer a run; it must never publish English
  as German or reuse one platform's release timestamp for the other.
- Do not replace existing curated website notes just because their wording differs
  from a shorter store summary. Add each newly public platform/version once.
- The first run creates `content/app-store-sync.json` from public source hashes.
  Later no-change runs do not commit, redeploy, or invent a new checked-at date.
  A source edit without a marketing-version change requires review.
- Missing historical notes stay explicitly unavailable. No private notes, local
  draft, source path, candidate build or testing record is copied into the website.

The standard suite retains the pinned 1.4.0-and-earlier public histories while
allowing genuine new versions. Importer tests use synthetic future releases;
they do not publish fake releases into product data.

## Deploy and verification

On a change, regenerate the three static update pages and their sitemap dates,
run the source tests, build/runtime checks and real Chromium desktop/mobile,
locale, platform, deep-link and no-JavaScript checks. Only the release JSON,
public sync hashes, three generated pages and sitemap may be committed by the bot.
An intervening main update rejects the push instead of overwriting it.

Keep the current Cloudflare Git integration. After a bot push, wait for its
Cloudflare Pages check and compare all three real production pages and the
sitemap to the committed source, then repeat browser checks on the public domain.
Never report a green repository commit as a successful deployment without this.

Failures are surfaced as GitHub Actions failures. GitHub's notification settings,
not a permanently running desktop chat, determine email/mobile failure alerts.

## Immediate wake-up from the app build

`workflow_dispatch` and `repository_dispatch` are enabled in the website workflow.
The hourly cloud schedule is fully independent of this optional shortcut. A token
in one repository cannot automatically write to another repository.

The app-side hook is `ci_scripts/ci_post_xcodebuild.sh`, calling
`Tools/notify_website_release.py` only after the required archive audit succeeds.
Until that app change is integrated and the secret below is saved, the immediate
connection is not enabled. Do not report an offline hook test as a real Cloud run.

1. Open [GitHub fine-grained tokens](https://github.com/settings/personal-access-tokens/new).
   Select owner `Sh7ne`, **Only select repositories**, then only
   `deepsurfcut-website`. Grant **Actions: Read and write**; Metadata retains its
   default read access. Do not grant Contents write or access to other repositories.
2. In each Xcode Cloud release workflow that archives iOS or macOS, add environment
   variable `WEBSITE_SYNC_TOKEN`. Enable **Secret / Keep value redacted**, paste
   the token there and save the workflow. Do not add it to Xcode build settings.
3. Confirm the live workflow start conditions before pushing the app-side hook.
   A website hook change must not silently authorize a new app archive, upload,
   version bump or review submission. Preserve all immutable release refs.
4. After the next authorized archive audit passes, verify its post-build log says
   the website public-store check was requested. On GitHub, verify a new
   `workflow_dispatch` run and its source check. If there is a newly public
   version, also verify the bot commit, Cloudflare deployment and real website.

Never paste the token into chat, Git, a URL, the app bundle or build logs. Replace
the secret before the token expires. A missing or expired token leaves the hourly
cloud check working independently. The helper sends a fixed `main` dispatch with
no build number, source path, release text or private metadata. It does not follow
HTTP redirects or print response bodies, exceptions or credentials.

The protected audit remains fatal on failure and is not bypassed by notification
handling. Website authorization, network or dispatch failures only warn; they
cannot turn a failed audit into success or fail an otherwise valid app archive.
No app source, signing, version, release refs, review settings or Cloudflare Apple
callback routes are changed by this connection.

GitHub may delay scheduled jobs and disables public-repository schedules after
long repository inactivity. The helper re-enables `disabled_inactivity` before
dispatching, but respects a manually disabled workflow. Monitor the Actions page.
No paid translation service, local SSH key, Cloudflare API token or App Store
Connect credential is required for the hourly public-store importer.

## Commands

```sh
npm run updates:sync             # read-only public-source plan
npm run updates:sync -- --apply  # validated update in a disposable checkout
npm test
npm run build
npm run test:runtime
npx playwright install chromium
npm run test:updates-browser
```

References:
- [GitHub workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- [GitHub token scope and trigger behavior](https://docs.github.com/en/actions/concepts/security/github_token)
- [Cloudflare Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/)
- [Apple Xcode Cloud custom scripts](https://developer.apple.com/documentation/xcode/writing-custom-build-scripts)
