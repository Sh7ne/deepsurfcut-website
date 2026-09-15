import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sign, X509Certificate } from 'node:crypto';

export const MESSAGE_ID = 'e0374278-668d-46b3-b38e-d467cefe9667';
export const CHINESE_MESSAGE_ID = '12e6970f-1c61-4c39-9910-2a0f44e48df5';
export const sandboxMessages = JSON.stringify({
  'test.subscription': { 'en-US': MESSAGE_ID, 'zh-Hans': CHINESE_MESSAGE_ID },
});
export const bindings = {
  RETENTION_MESSAGES_SANDBOX: sandboxMessages,
  RETENTION_MESSAGES_PRODUCTION: sandboxMessages,
};

// Ephemeral test CA with Apple's required certificate-purpose OIDs. It is never
// trusted by the deployed routes; no test private keys are stored in the repo.
export function createTestChain({ leafPurpose = true, intermediatePurpose = true, days = 2 } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'deepsurf-retention-test-'));
  const openssl = (...args) => execFileSync('openssl', args, { cwd: directory, stdio: 'pipe' });
  try {
    writeFileSync(join(directory, 'root.cnf'), '[req]\ndistinguished_name=dn\n[dn]\n[v3]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n');
    for (const name of ['root', 'intermediate', 'leaf']) {
      openssl('ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', `${name}.key`);
    }
    openssl('req', '-new', '-x509', '-key', 'root.key', '-out', 'root.pem', '-days', '2',
      '-subj', '/CN=Retention Test Root', '-config', 'root.cnf', '-extensions', 'v3');
    for (const [name, issuer, serial, extensions] of [
      ['intermediate', 'root', '2', `basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n${intermediatePurpose ? '1.2.840.113635.100.6.2.1=DER:05:00\n' : ''}`],
      ['leaf', 'intermediate', '3', `basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\n${leafPurpose ? '1.2.840.113635.100.6.11.1=DER:05:00\n' : ''}`],
    ]) {
      writeFileSync(join(directory, `${name}.ext`), extensions);
      openssl('req', '-new', '-key', `${name}.key`, '-out', `${name}.csr`, '-subj', `/CN=Retention Test ${name}`);
      if (name === 'leaf' && days < 0) {
        writeFileSync(join(directory, 'index.txt'), '');
        writeFileSync(join(directory, 'serial'), '03\n');
        writeFileSync(join(directory, 'ca.cnf'), '[ca]\ndefault_ca=defaults\n[defaults]\ndatabase=index.txt\nserial=serial\nnew_certs_dir=.\ndefault_md=sha256\npolicy=policy\n[policy]\ncommonName=supplied\n');
        openssl('ca', '-batch', '-config', 'ca.cnf', '-in', 'leaf.csr', '-out', 'leaf.pem',
          '-cert', 'intermediate.pem', '-keyfile', 'intermediate.key', '-extfile', 'leaf.ext',
          '-startdate', '20000101000000Z', '-enddate', '20010101000000Z');
      } else {
        openssl('x509', '-req', '-in', `${name}.csr`, '-CA', `${issuer}.pem`, '-CAkey', `${issuer}.key`,
          '-set_serial', serial, '-out', `${name}.pem`, '-days', String(name === 'leaf' ? days : 2), '-extfile', `${name}.ext`);
      }
    }
    const certificates = ['leaf', 'intermediate', 'root'].map((name) =>
      new X509Certificate(readFileSync(join(directory, `${name}.pem`))).raw);
    return {
      root: certificates[2],
      x5c: certificates.map((der) => der.toString('base64')),
      key: readFileSync(join(directory, 'leaf.key')),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function payload(overrides = {}) {
  return {
    appAppleId: 6776393723,
    environment: 'Sandbox',
    originalTransactionId: '2000000000000000',
    productId: 'test.subscription',
    userLocale: 'en-US',
    requestIdentifier: 'c9b98339-7e65-45f3-96fd-0d2e9da8b5df',
    signedDate: Date.now(),
    ...overrides,
  };
}

export function signedPayload(chain, overrides = {}, headerOverrides = {}) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode({ alg: 'ES256', x5c: chain.x5c, ...headerOverrides })}.${encode(payload(overrides))}`;
  return `${input}.${sign('sha256', Buffer.from(input), { key: chain.key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}

export function request(token, { method = 'POST', headers = {}, body = JSON.stringify({ signedPayload: token }) } = {}) {
  return new Request('https://deepsurf.app/api/retention/sandbox', {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(method === 'GET' || method === 'HEAD' ? {} : { body }),
  });
}
