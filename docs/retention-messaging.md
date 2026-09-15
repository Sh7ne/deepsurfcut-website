# Retention messaging endpoint

Minimal implementation of Apple's
[Get Retention Message endpoint](https://developer.apple.com/documentation/retentionmessaging/setting-up-retention-messaging-endpoint).
It returns a configured, approved text-message identifier for an exact subscription
product ID and locale. There is no database, customer tracking, offer signing, or
message-management UI.

## Endpoints

| Environment | Method and URL |
| --- | --- |
| Production | `POST https://deepsurf.app/api/retention` |
| Sandbox | `POST https://deepsurf.app/api/retention/sandbox` |

The App Store sends `{"signedPayload":"<Apple-signed JWS>"}` as
`Content-Type: application/json`. A matching, verified request receives HTTP 200:

```json
{
  "message": {
    "messageIdentifier": "<UUID of an APPROVED message>"
  }
}
```

## Configuration

Add the following text variables in the existing Cloudflare Pages project's
Settings > Variables and Secrets. Set production and preview deployment variables
independently; a Cloudflare preview deployment is distinct from Apple's Sandbox.

| Variable | Value |
| --- | --- |
| `RETENTION_MESSAGES_PRODUCTION` | JSON object mapping product IDs and locales to approved production message UUIDs |
| `RETENTION_MESSAGES_SANDBOX` | Same format, with sandbox message UUIDs |

Both routes can live on the production website so the sandbox URL remains stable.
Do not populate the production message map on preview deployments.

Example shape (replace the product and UUIDs with real approved values):

```json
{
  "YOUR_SUBSCRIPTION_PRODUCT_ID": {
    "en-US": "e0374278-668d-46b3-b38e-d467cefe9667",
    "zh-Hans": "12e6970f-1c61-4c39-9910-2a0f44e48df5"
  }
}
```

Use the exact, case-sensitive Apple `userLocale` value. There is no implicit
language or product fallback: unconfigured combinations return 503 so Apple can
use the default message configured for that product and locale. The sample UUIDs
are test values, not approved messages. Until messages are approved, leave the
maps empty (`{}`) as in `.dev.vars.example`.

The app ID is fixed to `6776393723`, matching this website's App Store links.
The inbound endpoint needs no App Store Connect API private key. Credentials used
to upload messages or configure Apple URLs belong in a separate administrative
workflow; never put `.p8` files or private keys in website assets.

## Verification and failure behavior

- Apple's pinned `@apple/app-store-server-library` verifies the JWS signature,
  certificate chain against the bundled Apple root certificates, certificate
  validity, and the Apple certificate-purpose extensions.
- Only ES256 is accepted. App ID and environment are checked in both routes.
- Requests must have the required fields and a `signedDate` within the last five
  minutes, with up to one minute of clock skew into the future. Repeated valid
  requests receive the same configured response without storing transaction IDs.
- Apple's offline verification mode is used to avoid per-request network calls
  in the 700 ms deadline. Certificate validity is checked at `signedDate`; live
  OCSP revocation checks are **not** performed. Keep the pinned Apple library and
  public trust anchors updated as part of normal maintenance.
- Bodies are limited to 32 KiB, including streamed bodies. Responses use
  `Cache-Control: no-store`. Request payloads and transaction IDs are not logged.

| HTTP status | Meaning |
| --- | --- |
| 200 | Verified request and configured message UUID |
| 400 | Malformed JSON/JWS or unsupported JWS header |
| 401 | Invalid signature, certificate, app ID, environment, or signed payload |
| 405 | Method other than POST |
| 413 | Request body exceeds 32 KiB |
| 415 | Content type is not `application/json` |
| 503 | No valid configured message for the product and locale |

Apple displays its configured default message when this endpoint fails; without
a default, it displays no retention message. The endpoint never claims success
with an empty response or invents a message ID. It does not query message approval
state during requests: configure only messages (and associated images) in
`APPROVED` state, and remove a mapping if its approval is withdrawn.

## Deployment and Apple activation

The code and local tests can be completed before messages are approved. Activation
requires the following external setup:

1. Update the existing Pages build settings as documented in the main README:
   build command `npm run build`, output `dist`, Node.js 22 or later. Confirm the
   existing Pages project name matches `wrangler.jsonc`, then deploy through its
   existing Git integration or Wrangler. Dashboard drag-and-drop uploads do not
   support Pages Functions.
2. Ensure the domain has a valid HTTPS certificate and supports TLS 1.2. The two
   API paths must be reachable by Apple without a login or interactive challenge.
3. Upload messages with Apple's Retention Messaging API and wait for `APPROVED`.
   Configure the appropriate message maps in Pages. Configure Apple default
   messages for the intended product/locale combinations as a fallback.
4. Call Apple's **Configure Realtime URL** in Sandbox with the sandbox URL.
5. Run **Initiate Performance Test** using a real sandbox subscription transaction
   ID. Inspect its results and `responseTimeThreshold`; the nominal target is
   approximately 700 ms. Local timings are not proof of passing Apple's test.
6. After the test passes, configure the approved production messages and call
   **Configure Realtime URL** in Production with the production URL.

No deployment or Apple account configuration is performed by `npm test`,
`npm run test:runtime`, or `npm run build`.

## References

- [Responding to requests](https://developer.apple.com/documentation/retentionmessaging/responding-to-realtime-retention-messaging-requests)
- [Decoded request fields and App ID check](https://developer.apple.com/documentation/retentionmessaging/decodedrealtimerequestbody)
- [Setting up messages and defaults](https://developer.apple.com/documentation/retentionmessaging/setting-up-retention-messages)
- [Performance test](https://developer.apple.com/documentation/retentionmessaging/initiate-performance-test)
- [Apple's Node.js library](https://github.com/apple/app-store-server-library-node)
- [Apple root certificates](https://www.apple.com/certificateauthority/)
- [Cloudflare Pages Functions configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)
