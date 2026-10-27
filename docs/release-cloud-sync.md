# Cloud release synchronization

The maintained workflow is `.github/workflows/sync-app-store.yml` in the public
website repository. It runs on GitHub-hosted Ubuntu runners, not on the owner's
computer. The desktop follow-up must remain a fallback until the first real cloud
run and bot-commit Cloudflare deployment have been verified.

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

## Optional immediate wake-up from the app build

`workflow_dispatch` and `repository_dispatch` are enabled in the website workflow.
The hourly cloud schedule is fully independent of this optional shortcut. A token
in one repository cannot automatically write to another repository.

To connect Xcode Cloud, create a fine-grained token restricted to the website
repository with **Actions: write**. Store it as the secret environment variable
`WEBSITE_SYNC_TOKEN` in the release workflow. Never paste it into chat, Git, a URL,
the app bundle or build logs. Keep shell tracing off. After a successful protected
archive audit, invoke the following static dispatch call:

```sh
curl --fail --silent --show-error --max-time 20 \
  --request POST \
  --header "Authorization: Bearer $WEBSITE_SYNC_TOKEN" \
  --header 'Accept: application/vnd.github+json' \
  --header 'X-GitHub-Api-Version: 2022-11-28' \
  --header 'Content-Type: application/json' \
  --data '{"ref":"main"}' \
  https://api.github.com/repos/Sh7ne/deepsurfcut-website/actions/workflows/sync-app-store.yml/dispatches
```

The app's current post-build script ends with `exec` into its required audit.
Do not append code after `exec`, bypass that audit, weaken its failure exit, or
fail an app release merely because this optional website wake-up failed. Hook
installation is a separate app-CI change, not activated by adding this workflow.
This migration does not change app source, signing, release refs, review settings,
existing archive gates or Cloudflare's Apple callback routes.

GitHub may delay scheduled jobs and disables public-repository schedules after
long repository inactivity. Monitor the Actions page; the optional upstream hook
can re-enable a disabled workflow through the GitHub API before dispatching it.
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
