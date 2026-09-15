import { Buffer } from 'node:buffer';
import { appleRootCertificates } from './apple-roots.js';

// Same app as the App Store links on the website.
export const APP_APPLE_ID = 6776393723;
const MAX_BODY_BYTES = 32 * 1024;
const MAX_AGE_MS = 5 * 60 * 1000;
const MAX_FUTURE_MS = 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const own = (value, key) => Object.hasOwn(value, key) ? value[key] : undefined;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function reply(status, body, headers = {}) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

class RequestError extends Error {
  constructor(status) {
    super('Invalid request');
    this.status = status;
  }
}

async function readBody(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES) {
    throw new RequestError(413);
  }
  if (!request.body) throw new RequestError(400);
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        // Do not wait for an untrusted sender to finish uploading.
        void reader.cancel().catch(() => {});
        throw new RequestError(413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
  if (!isObject(body) || typeof body.signedPayload !== 'string') {
    throw new RequestError(400);
  }
  // Require a compact ES256 JWS before handing it to Apple's verifier.
  const parts = body.signedPayload.split('.');
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) {
    throw new RequestError(400);
  }
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  if (!isObject(header) || header.alg !== 'ES256' || header.crit !== undefined) {
    throw new RequestError(400);
  }
  return body.signedPayload;
}

function validPayload(payload, environment) {
  const age = Date.now() - payload.signedDate;
  return payload.appAppleId === APP_APPLE_ID
    && payload.environment === environment
    && Number.isSafeInteger(payload.signedDate)
    && age >= -MAX_FUTURE_MS && age <= MAX_AGE_MS
    && typeof payload.originalTransactionId === 'string' && payload.originalTransactionId.length > 0
    && typeof payload.productId === 'string' && payload.productId.length > 0
    && typeof payload.userLocale === 'string' && payload.userLocale.length > 0
    && typeof payload.requestIdentifier === 'string' && UUID.test(payload.requestIdentifier);
}

// roots is an internal test seam, never a request parameter or environment binding.
// The two deployed entry points always use the bundled Apple trust anchors.
export function createRetentionHandler(environment, roots = appleRootCertificates) {
  if (environment !== 'Production' && environment !== 'Sandbox') {
    throw new Error('Unsupported retention environment');
  }
  // Apple's offline mode validates signatures, certificate chains, Apple-specific
  // certificate extensions, and certificate validity at signedDate. Avoid OCSP
  // network round trips in Apple's 700 ms response window; enforce freshness below.
  // Retention payloads have appAppleId but no bundleId; this method ignores bundleId.
  let verifier;
  const binding = `RETENTION_MESSAGES_${environment.toUpperCase()}`;

  return async function onRequest({ request, env }) {
    if (request.method !== 'POST') {
      return reply(405, { error: 'method_not_allowed' }, { Allow: 'POST' });
    }
    if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return reply(415, { error: 'unsupported_media_type' });
    }

    let signedPayload;
    try {
      signedPayload = await readBody(request);
    } catch (error) {
      return reply(error instanceof RequestError ? error.status : 400, { error: 'invalid_request' });
    }

    let payload;
    try {
      // jsrsasign (an Apple library dependency) initializes a random seed when
      // imported. Cloudflare permits this only inside a request, not global scope.
      // Import just the verifier, and reuse its instance for subsequent requests.
      if (!verifier) {
        const { SignedDataVerifier } = await import('@apple/app-store-server-library/dist/jws_verification.js');
        verifier ??= new SignedDataVerifier(roots, false, environment, '', APP_APPLE_ID);
      }
      payload = await verifier.verifyAndDecodeRealtimeRequest(signedPayload);
      // Apple's library checks appAppleId only in Production. Check it in BOTH
      // environments, as required by the Retention Messaging documentation.
      if (!validPayload(payload, environment)) throw new Error('Invalid payload');
    } catch {
      return reply(401, { error: 'invalid_signed_payload' });
    }

    let messageIdentifier;
    try {
      const messages = JSON.parse(env[binding] ?? '{}');
      if (!isObject(messages)) throw new Error('Invalid configuration');
      const productMessages = own(messages, payload.productId);
      messageIdentifier = isObject(productMessages) ? own(productMessages, payload.userLocale) : undefined;
      if (typeof messageIdentifier !== 'string' || !UUID.test(messageIdentifier)) {
        throw new Error('No configured message');
      }
    } catch {
      // A failed request lets Apple use its configured default message. Never
      // return a placeholder UUID or an empty successful response.
      return reply(503, { error: 'message_unavailable' });
    }

    return reply(200, { message: { messageIdentifier } });
  };
}
