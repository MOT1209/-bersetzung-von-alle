// server/providers/storage/s3.js — S3-compatible storage driver (AWS S3 / Cloudflare R2 / MinIO)
//
// Implementation: fetch + AWS Signature V4 (no npm dependency).
// S3 REST API is well-documented; the SDK is not needed for the five verbs
// (HEAD/GET/PUT/DELETE/LIST) that the storage interface requires.
//
// Config: S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY,
//         S3_FORCE_PATH_STYLE (MinIO), S3_PUBLIC_URL (optional).

const crypto = require('crypto');
const config = require('../../config');
const { normalizeKey } = require('./keys');

// SHA-256 of empty string (used when body is empty)
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/**
 * AWS UriEncode: encode every byte except unreserved A-Za-z0-9-_.~ .
 * RFC 3986 encodeURIComponent leaves !'()* unencoded; AWS requires them encoded.
 */
function uriEncode(str) {
  return encodeURIComponent(str)
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/**
 * Build the canonical query string (sorted by key, each key/value uri-encoded).
 * @param {URL} url
 * @returns {string} e.g. 'list-type=2&prefix=projects%2Fp1'
 */
function canonicalQueryString(url) {
  const params = [...url.searchParams.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return params.map(([k, v]) => `${uriEncode(k)}=${uriEncode(v)}`).join('&');
}

// ─── AWS Signature V4 ────────────────────────────────────────────────────────

/**
 * HMAC-SHA256 helper. Returns a Buffer.
 */
function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

/**
 * Derive the SigV4 signing key from the secret, date, region, and service.
 *   signingKey = HMAC(HMAC(HMAC(HMAC("AWS4"+secret, date), region), service), "aws4_request")
 */
function deriveSigningKey(secret, dateStamp, region, service) {
  const kDate = hmac('AWS4' + secret, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  return kSigning;
}

/**
 * Build the canonical request for SigV4.
 *
 * @param {string} method        HTTP method (GET, PUT, DELETE, HEAD)
 * @param {string} canonicalUri  Encoded object path (e.g. /bucket/key or /key)
 * @param {string} canonicalQuery  Canonical query string ('' when none)
 * @param {object} headers       Headers to include (lowercased keys)
 * @param {string[]} signedHeaderNames  Sorted lowercased header names
 * @param {string} payloadHash   Hex-encoded SHA-256 of request body
 * @returns {string} canonical request string
 */
function buildCanonicalRequest(method, canonicalUri, canonicalQuery, headers, signedHeaderNames, payloadHash) {
  const canonicalHeaders = signedHeaderNames
    .map((n) => `${n}:${headers[n]}\n`)
    .join('');
  const signedHeaders = signedHeaderNames.join(';');

  return [
    method,
    canonicalUri,
    canonicalQuery || '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
}

/**
 * Build the string to sign for SigV4.
 *
 * @param {string} algorithm     'AWS4-HMAC-SHA256'
 * @param {string} amzDate       ISO 8601 basic format timestamp
 * @param {string} credentialScope  'dateStamp/region/service/aws4_request'
 * @param {string} canonicalRequestHash  Hex SHA-256 of canonical request
 * @returns {string} string to sign
 */
function buildStringToSign(algorithm, amzDate, credentialScope, canonicalRequestHash) {
  return [
    algorithm,
    amzDate,
    credentialScope,
    canonicalRequestHash,
  ].join('\n');
}

/**
 * Compute the signature from the signing key and string to sign.
 *
 * @param {Buffer} signingKey  Derived signing key
 * @param {string} stringToSign  The string-to-sign
 * @returns {string} hex-encoded signature
 */
function computeSignature(signingKey, stringToSign) {
  return hmac(signingKey, stringToSign).toString('hex');
}

/**
 * Build the Authorization header value for SigV4.
 *
 * @param {string} accessKeyId
 * @param {string} dateStamp    YYYYMMDD
 * @param {string} region
 * @param {string} service      's3'
 * @param {string} signedHeaders  semicolon-separated sorted header names
 * @param {string} signature    hex signature
 * @returns {string} Authorization header value
 */
function buildAuthorization(accessKeyId, dateStamp, region, service, signedHeaders, signature) {
  // No spaces after commas — matches the format AWS publishes in its docs
  // and test vectors exactly.
  return `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${dateStamp}/${region}/${service}/aws4_request,SignedHeaders=${signedHeaders},Signature=${signature}`;
}

/**
 * Sign an HTTP request for S3.
 *
 * @param {object} opts
 * @param {string} opts.method       HTTP method
 * @param {string} opts.url          Full request URL (https://...)
 * @param {object} opts.headers      Headers to send (will be augmented with SigV4)
 * @param {Buffer|string|null} opts.body  Request body (null/undefined = empty)
 * @param {string} opts.accessKeyId
 * @param {string} opts.secretAccessKey
 * @param {string} opts.region
 * @param {string} [opts.service='s3']
 * @param {Date} [opts.now]  Override clock (tests only)
 * @returns {{ headers: object, url: string }} Augmented headers and URL
 */
function signRequest({ method, url, headers, body, accessKeyId, secretAccessKey, region, service, now }) {
  service = service || 's3';

  const date = now || new Date();
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateStamp = amzDate.slice(0, 8);

  const parsedUrl = new URL(url);
  const host = parsedUrl.host;

  // Payload hash
  let payloadHash;
  if (body === null || body === undefined) {
    payloadHash = EMPTY_SHA256;
  } else {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
    payloadHash = crypto.createHash('sha256').update(buf).digest('hex');
  }

  // Build headers object with required signed headers
  const hdrs = { ...headers };
  hdrs['host'] = host;
  hdrs['x-amz-date'] = amzDate;
  hdrs['x-amz-content-sha256'] = payloadHash;

  // Sorted header names for signing
  const signedHeaderNames = Object.keys(hdrs).sort();

  // Canonical request
  const canonicalUri = parsedUrl.pathname || '/';
  const canonicalRequest = buildCanonicalRequest(method, canonicalUri, canonicalQueryString(parsedUrl), hdrs, signedHeaderNames, payloadHash);
  const canonicalRequestHash = crypto.createHash('sha256').update(canonicalRequest).digest('hex');

  // String to sign
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = buildStringToSign('AWS4-HMAC-SHA256', amzDate, credentialScope, canonicalRequestHash);

  // Signing key + signature
  const signingKey = deriveSigningKey(secretAccessKey, dateStamp, region, service);
  const signature = computeSignature(signingKey, stringToSign);

  // Authorization header
  const authorization = buildAuthorization(accessKeyId, dateStamp, region, service, signedHeaderNames.join(';'), signature);

  // Return augmented headers
  const out = { ...hdrs };
  out['authorization'] = authorization;

  return { headers: out, url };
}

// ─── S3 Storage Driver ───────────────────────────────────────────────────────

function createS3Storage(opts = {}) {
  const endpoint = opts.endpoint || config.S3_ENDPOINT || '';
  const region = opts.region || config.S3_REGION || 'auto';
  const bucket = opts.bucket || config.S3_BUCKET || '';
  const accessKeyId = opts.accessKeyId || config.S3_ACCESS_KEY_ID || '';
  const secretAccessKey = opts.secretAccessKey || config.S3_SECRET_ACCESS_KEY || '';
  const forcePathStyle = String(opts.forcePathStyle || config.S3_FORCE_PATH_STYLE || 'false') === 'true';
  const s3Prefix = opts.prefix || config.S3_PREFIX || '';
  const publicUrl = opts.publicUrl || config.S3_PUBLIC_URL || '';

  /**
   * Build the base URL for an S3 object key.
   * Path-style:     https://{endpoint}/{bucket}/{key}      (MinIO, or forced)
   * Virtual-hosted: https://{bucket}.{endpoint-host}/{key} (AWS, R2 — default)
   * When no endpoint is configured, derive the AWS URL from the region.
   */
  function objectUrl(key) {
    const keyPart = key ? key : '';
    if (forcePathStyle || !endpoint) {
      if (!endpoint) return `https://${bucket}.s3.${region}.amazonaws.com/${keyPart}`;
      return `${endpoint.replace(/\/+$/, '')}/${bucket}/${keyPart}`;
    }
    // Virtual-hosted style: prepend the bucket to the endpoint hostname.
    const url = new URL(endpoint);
    url.hostname = `${bucket}.${url.hostname}`;
    url.pathname = `/${keyPart}`;
    return url.href;
  }

  /**
   * Execute a signed S3 request.
   */
  async function s3Request(method, key, body, extraHeaders) {
    const url = objectUrl(key);
    const hdrs = { ...extraHeaders };
    if (body) {
      hdrs['content-type'] = 'application/octet-stream';
    }
    const signed = signRequest({
      method,
      url,
      headers: hdrs,
      body,
      accessKeyId,
      secretAccessKey,
      region,
      service: 's3',
    });

    const res = await fetch(signed.url, {
      method,
      headers: signed.headers,
      body: body || undefined,
      signal: AbortSignal.timeout(15000),
    });

    return res;
  }

  /**
   * Full S3 object key including the optional prefix.
   */
  function fullKey(key) {
    const safe = normalizeKey(key);
    return s3Prefix ? `${s3Prefix}/${safe}` : safe;
  }

  return {
    id: 's3',
    label: 'S3 / R2',

    isAvailable() {
      return Boolean(endpoint && bucket && accessKeyId && secretAccessKey);
    },

    async put(key, data) {
      const fk = fullKey(key);
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      const res = await s3Request('PUT', fk, buf);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const e = new Error(`s3-put failed: ${res.status} ${text}`);
        e.code = 's3-error';
        e.status = res.status;
        throw e;
      }
      return { key: normalizeKey(key), bytes: buf.length };
    },

    async get(key) {
      const fk = fullKey(key);
      const res = await s3Request('GET', fk, null);
      if (res.status === 404) return null;
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const e = new Error(`s3-get failed: ${res.status} ${text}`);
        e.code = 's3-error';
        e.status = res.status;
        throw e;
      }
      const arrayBuf = await res.arrayBuffer();
      return Buffer.from(arrayBuf);
    },

    async stat(key) {
      const fk = fullKey(key);
      const res = await s3Request('HEAD', fk, null);
      if (res.status === 404) return null;
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const e = new Error(`s3-head failed: ${res.status} ${text}`);
        e.code = 's3-error';
        e.status = res.status;
        throw e;
      }
      const bytes = Number(res.headers.get('content-length') || '0');
      const lastModified = res.headers.get('last-modified');
      const modifiedAt = lastModified ? new Date(lastModified).getTime() : Date.now();
      return { key: normalizeKey(key), bytes, modifiedAt };
    },

    async exists(key) {
      return (await this.stat(key)) !== null;
    },

    async remove(key) {
      const fk = fullKey(key);
      const res = await s3Request('DELETE', fk, null);
      // S3 DELETE is idempotent — 404 is also success
      if (!res.ok && res.status !== 404) {
        const text = await res.text().catch(() => '');
        const e = new Error(`s3-delete failed: ${res.status} ${text}`);
        e.code = 's3-error';
        e.status = res.status;
        throw e;
      }
      return true;
    },

    async removePrefix(prefix) {
      const keys = await this.list(prefix);
      if (keys.length === 0) return false;
      // Batch delete — S3 DeleteObjects supports up to 1000 keys per request
      for (let i = 0; i < keys.length; i += 1000) {
        const batch = keys.slice(i, i + 1000);
        const deleteXml =
          '<?xml version="1.0" encoding="UTF-8"?>\n' +
          '<Delete>\n' +
          batch.map((k) => {
            // list() returns app keys (prefix stripped); DeleteObjects needs
            // the full S3 object key with the configured prefix re-added.
            const objectKey = s3Prefix ? `${s3Prefix}/${k}` : k;
            return `<Object><Key>${escapeXml(objectKey)}</Key></Object>`;
          }).join('\n') +
          '\n</Delete>';

        const url = objectUrl('') + '?delete';
        const signed = signRequest({
          method: 'POST',
          url,
          headers: {
            'content-type': 'application/xml',
          },
          body: deleteXml,
          accessKeyId,
          secretAccessKey,
          region,
          service: 's3',
        });

        const res = await fetch(signed.url, {
          method: 'POST',
          headers: signed.headers,
          body: deleteXml,
          signal: AbortSignal.timeout(30000),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          const e = new Error(`s3-delete-batch failed: ${res.status} ${text}`);
          e.code = 's3-error';
          e.status = res.status;
          throw e;
        }
      }
      return true;
    },

    async list(prefix) {
      const fkPrefix = s3Prefix ? `${s3Prefix}/${normalizeKey(prefix)}` : normalizeKey(prefix);
      const out = [];
      let continuationToken = '';

      do {
        let qs = `?list-type=2&prefix=${encodeURIComponent(fkPrefix + '/')}`;
        if (continuationToken) {
          qs += `&continuation-token=${encodeURIComponent(continuationToken)}`;
        }
        const listUrl = objectUrl('') + qs;

        const signed = signRequest({
          method: 'GET',
          url: listUrl,
          headers: {},
          body: null,
          accessKeyId,
          secretAccessKey,
          region,
          service: 's3',
        });

        const res = await fetch(signed.url, {
          method: 'GET',
          headers: signed.headers,
          signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          const e = new Error(`s3-list failed: ${res.status} ${text}`);
          e.code = 's3-error';
          e.status = res.status;
          throw e;
        }

        const xml = await res.text();
        // Parse keys from ListBucketResult XML
        // Use regex to extract <Key> values — avoids XML parser dependency
        const keyRegex = /<Key>([^<]+)<\/Key>/g;
        let match;
        while ((match = keyRegex.exec(xml)) !== null) {
          const fullS3Key = match[1];
          // Strip the s3Prefix to return keys matching local.js conventions
          let appKey = fullS3Key;
          if (s3Prefix && appKey.startsWith(s3Prefix + '/')) {
            appKey = appKey.slice(s3Prefix.length + 1);
          }
          out.push(appKey);
        }

        // Check if more pages
        const isTruncated = /<IsTruncated>(true|True)<\/IsTruncated>/.test(xml);
        if (isTruncated) {
          const tokenMatch = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
          continuationToken = tokenMatch ? tokenMatch[1] : '';
        } else {
          continuationToken = '';
        }
      } while (continuationToken);

      return out.sort();
    },

    // Public URL accessor for callers that need a direct link
    _publicUrl: publicUrl,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Escape XML special characters for S3 DeleteObjects request body. */
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

module.exports = {
  createS3Storage,
  signRequest,
  buildAuthorization,
  buildCanonicalRequest,
  buildStringToSign,
  deriveSigningKey,
  computeSignature,
  canonicalQueryString,
  uriEncode,
  EMPTY_SHA256,
};
