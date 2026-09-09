// tests/storage-s3.test.js — S3 storage driver: SigV4 signing + shape parity
// No network calls — tests pure signing functions and interface compatibility.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  signRequest,
  buildCanonicalRequest,
  buildStringToSign,
  deriveSigningKey,
  computeSignature,
  buildAuthorization,
  canonicalQueryString,
  EMPTY_SHA256,
} = require('../server/providers/storage/s3');
const { createS3Storage } = require('../server/providers/storage/s3');
const { createLocalStorage } = require('../server/providers/storage/local');

// ─── AWS SigV4 Canonical Test Vector (GET Object) ────────────────────────────
// Source: https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html
//   "Example: GET Object" — retrieves bytes 0-9 of /test.txt from examplebucket.
//   Request: GET /test.txt, headers: host, range, x-amz-date + payload hash
//   Key: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY, region us-east-1, service s3
//   Date: 20130524, x-amz-date: 20130524T000000Z, empty body

const TEST_VECTOR = {
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  region: 'us-east-1',
  service: 's3',
  dateStamp: '20130524',
  amzDate: '20130524T000000Z',
  method: 'GET',
  uri: '/test.txt',
  headers: {
    host: 'examplebucket.s3.amazonaws.com',
    range: 'bytes=0-9',
    'x-amz-content-sha256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'x-amz-date': '20130524T000000Z',
  },
  signedHeaders: ['host', 'range', 'x-amz-content-sha256', 'x-amz-date'],
  // Expected values published in the AWS docs
  expectedCrHash: '7344ae5b7ee6c3e7e6b0fe0640412a37625d1fbfff95c48bbb2dc43964946972',
  expectedSignature: 'f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
};

// Build the canonical request exactly as the driver does for the test vector
function canonicalRequestForTestVector() {
  return buildCanonicalRequest(
    TEST_VECTOR.method,
    TEST_VECTOR.uri,
    '', // no query string
    TEST_VECTOR.headers,
    TEST_VECTOR.signedHeaders,
    EMPTY_SHA256,
  );
}

test('SigV4: canonical request matches the AWS GET Object example', () => {
  const cr = canonicalRequestForTestVector();
  // Rebuild the same way buildCanonicalRequest does: each header gets a
  // trailing newline, then the sections are joined with newlines.
  const canonicalHeaders = TEST_VECTOR.signedHeaders
    .map((n) => `${n}:${TEST_VECTOR.headers[n]}\n`).join('');
  const expected = [
    'GET',
    '/test.txt',
    '',
    canonicalHeaders,
    'host;range;x-amz-content-sha256;x-amz-date',
    EMPTY_SHA256,
  ].join('\n');
  assert.equal(cr, expected);
});

test('SigV4: canonical request hash matches AWS published value', () => {
  const cr = canonicalRequestForTestVector();
  const crHash = crypto.createHash('sha256').update(cr).digest('hex');
  assert.equal(crHash, TEST_VECTOR.expectedCrHash);
});

test('SigV4: string-to-sign is correct', () => {
  const cr = canonicalRequestForTestVector();
  const crHash = crypto.createHash('sha256').update(cr).digest('hex');
  const credentialScope = `${TEST_VECTOR.dateStamp}/${TEST_VECTOR.region}/${TEST_VECTOR.service}/aws4_request`;
  const sts = buildStringToSign('AWS4-HMAC-SHA256', TEST_VECTOR.amzDate, credentialScope, crHash);

  const lines = sts.split('\n');
  assert.equal(lines[0], 'AWS4-HMAC-SHA256');
  assert.equal(lines[1], TEST_VECTOR.amzDate);
  assert.equal(lines[2], credentialScope);
  assert.equal(lines[3], TEST_VECTOR.expectedCrHash);
});

test('SigV4: signing key derivation produces a 32-byte key', () => {
  const key = deriveSigningKey(
    TEST_VECTOR.secretAccessKey,
    TEST_VECTOR.dateStamp,
    TEST_VECTOR.region,
    TEST_VECTOR.service,
  );
  assert.ok(Buffer.isBuffer(key), 'signing key should be a Buffer');
  assert.equal(key.length, 32, 'HMAC-SHA256 signing key should be 32 bytes');
});

test('SigV4: full signature matches the AWS GET Object example', () => {
  const cr = canonicalRequestForTestVector();
  const crHash = crypto.createHash('sha256').update(cr).digest('hex');
  const credentialScope = `${TEST_VECTOR.dateStamp}/${TEST_VECTOR.region}/${TEST_VECTOR.service}/aws4_request`;
  const sts = buildStringToSign('AWS4-HMAC-SHA256', TEST_VECTOR.amzDate, credentialScope, crHash);

  const signingKey = deriveSigningKey(
    TEST_VECTOR.secretAccessKey,
    TEST_VECTOR.dateStamp,
    TEST_VECTOR.region,
    TEST_VECTOR.service,
  );
  const signature = computeSignature(signingKey, sts);

  assert.equal(signature, TEST_VECTOR.expectedSignature,
    `Expected ${TEST_VECTOR.expectedSignature} but got ${signature}`);
});

test('SigV4: Authorization header format is correct', () => {
  const auth = buildAuthorization(
    TEST_VECTOR.accessKeyId,
    TEST_VECTOR.dateStamp,
    TEST_VECTOR.region,
    TEST_VECTOR.service,
    TEST_VECTOR.signedHeaders.join(';'),
    TEST_VECTOR.expectedSignature,
  );
  assert.ok(auth.startsWith('AWS4-HMAC-SHA256 Credential='));
  assert.ok(auth.includes(`Credential=${TEST_VECTOR.accessKeyId}/${TEST_VECTOR.dateStamp}/us-east-1/s3/aws4_request`));
  assert.ok(auth.includes(`SignedHeaders=${TEST_VECTOR.signedHeaders.join(';')}`));
  assert.ok(auth.includes(`Signature=${TEST_VECTOR.expectedSignature}`));
});

test('SigV4: EMPTY_SHA256 is the SHA-256 of the empty string', () => {
  assert.equal(EMPTY_SHA256, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('SigV4: signRequest returns augmented headers with authorization', () => {
  const result = signRequest({
    method: 'GET',
    url: 'https://examplebucket.s3.amazonaws.com/test.txt',
    headers: { range: 'bytes=0-9' },
    body: null,
    accessKeyId: TEST_VECTOR.accessKeyId,
    secretAccessKey: TEST_VECTOR.secretAccessKey,
    region: TEST_VECTOR.region,
    service: 's3',
  });

  assert.ok(result.headers.authorization, 'should have authorization header');
  assert.ok(result.headers['x-amz-date'], 'should have x-amz-date header');
  assert.ok(result.headers['x-amz-content-sha256'], 'should have x-amz-content-sha256');
  assert.ok(result.headers.host, 'should have host header');
  assert.equal(result.headers['x-amz-content-sha256'], EMPTY_SHA256, 'empty body hash');
  assert.ok(result.url, 'should have url');
});

test('SigV4: signRequest end-to-end reproduces the AWS published Authorization header', () => {
  const result = signRequest({
    method: 'GET',
    url: 'https://examplebucket.s3.amazonaws.com/test.txt',
    headers: { range: 'bytes=0-9' },
    body: null,
    accessKeyId: TEST_VECTOR.accessKeyId,
    secretAccessKey: TEST_VECTOR.secretAccessKey,
    region: TEST_VECTOR.region,
    service: 's3',
    now: new Date('2013-05-24T00:00:00Z'),
  });

  assert.equal(
    result.headers.authorization,
    'AWS4-HMAC-SHA256 ' +
    'Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request,' +
    'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,' +
    'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
  );
  assert.equal(result.headers['x-amz-date'], '20130524T000000Z');
});

test('SigV4: signRequest with a Buffer body hashes the payload', () => {
  const body = Buffer.from('hello world');
  const result = signRequest({
    method: 'PUT',
    url: 'https://mybucket.s3.amazonaws.com/test.txt',
    headers: {},
    body,
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    region: 'us-east-1',
    service: 's3',
  });
  const expectedHash = crypto.createHash('sha256').update(body).digest('hex');
  assert.equal(result.headers['x-amz-content-sha256'], expectedHash);
});

test('SigV4: canonical query string is sorted and uri-encoded', () => {
  // + and / arrive percent-encoded (as the driver sends them); URLSearchParams
  // decodes %2B to + and %2F to / — the canonical form re-encodes them.
  const url = new URL('https://examplebucket.s3.amazonaws.com/?list-type=2&prefix=projects%2Fp1&continuation-token=ab%2Bc%2Fd');
  const qs = canonicalQueryString(url);
  assert.equal(qs, 'continuation-token=ab%2Bc%2Fd&list-type=2&prefix=projects%2Fp1');
});

test('SigV4: signRequest keeps an already-encoded query URL intact', () => {
  const result = signRequest({
    method: 'GET',
    url: 'https://examplebucket.s3.amazonaws.com/?list-type=2&prefix=projects%2Fp1',
    headers: {},
    body: null,
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    region: 'us-east-1',
    service: 's3',
  });
  assert.ok(result.headers.authorization);
  assert.ok(/SignedHeaders=host;x-amz-content-sha256;x-amz-date/.test(result.headers.authorization));
  assert.ok(/Signature=[0-9a-f]{64}$/.test(result.headers.authorization));
  assert.ok(result.url.includes('prefix=projects%2Fp1'), 'prefix slash must stay encoded in the request URL');
});

test('SigV4: subresource ?delete signs as an empty value', () => {
  const result = signRequest({
    method: 'POST',
    url: 'https://examplebucket.s3.amazonaws.com/?delete',
    headers: { 'content-type': 'application/xml' },
    body: '<Delete/>',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    region: 'us-east-1',
    service: 's3',
  });
  assert.ok(result.headers.authorization);
  assert.ok(result.url.includes('?delete'));
});

// ─── Driver Shape Parity ─────────────────────────────────────────────────────

test('S3 driver has the same methods as the local driver', () => {
  const s3 = createS3Storage();
  const local = createLocalStorage({ root: './tmp-test-root' });

  const localKeys = Object.keys(local).filter((k) => !k.startsWith('_'));
  for (const key of localKeys) {
    assert.ok(key in s3, `S3 driver missing method: ${key}`);
    assert.equal(typeof s3[key], typeof local[key], `S3.${key} type mismatch`);
  }
});

test('S3 driver exposes id and label like local', () => {
  const s3 = createS3Storage();
  const local = createLocalStorage({ root: './tmp-test-root' });
  assert.equal(typeof s3.id, 'string');
  assert.equal(typeof s3.label, 'string');
  assert.notEqual(s3.id, local.id, 'S3 driver should have a different id');
});

test('S3 driver isAvailable returns false when env is empty', () => {
  const s3 = createS3Storage();
  assert.equal(s3.isAvailable(), false);
});

test('S3 driver isAvailable returns true when all required config is set', () => {
  const s3 = createS3Storage({
    endpoint: 'https://s3.amazonaws.com',
    bucket: 'test-bucket',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  });
  assert.equal(s3.isAvailable(), true);
});