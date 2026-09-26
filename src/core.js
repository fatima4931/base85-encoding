/**
 * Base85 core encoding/decoding logic.
 *
 * Variant: Z85-style (ZeroMQ RFC 32) alphabet. We deliberately chose Z85 over
 * the older Ascii85 (Adobe) variant because Z85's alphabet is composed
 * entirely of printable, unreserved characters that survive transport through
 * JSON, XML, and most URI contexts without escaping. Ascii85 includes '\"',
 * ''', '\\', '<', '>', '&', and other characters that require escaping in
 * those formats, which defeats much of the purpose of a compact text encoding.
 *
 * Z85 encodes each 4-byte group into 5 characters and requires input length
 * to be a multiple of 4 bytes. We expose a lower-level encodeBlock/decodeBlock
 * pair (which enforce that invariant) and a padded encode/decode pair that
 * handles arbitrary-length input by padding with zero bytes and recording the
 * original length in a one-byte suffix.
 */

const ALPHABET =
  '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-:+=^!/*?&<>()[]{}@%$#';

const DECODE_MAP = new Map();
for (let i = 0; i < ALPHABET.length; i++) {
  DECODE_MAP.set(ALPHABET.charCodeAt(i), i);
}

/**
 * Encode exactly 4 bytes into 5 Z85 characters.
 *
 * We treat the 4 input bytes as a single 32-bit big-endian unsigned integer,
 * then emit five base-85 digits from most to least significant. Reading as
 * big-endian matches the Z85 spec and keeps round-trips independent of host
 * byte order.
 *
 * @param {Uint8Array} input - exactly 4 bytes
 * @returns {string} 5-character Z85 string
 */
export function encodeBlock(input) {
  if (!(input instanceof Uint8Array)) {
    throw new TypeError('input must be a Uint8Array');
  }
  if (input.length !== 4) {
    throw new RangeError('encodeBlock requires exactly 4 bytes');
  }

  let value =
    (input[0] * 256 * 256 * 256 +
      input[1] * 256 * 256 +
      input[2] * 256 +
      input[3]) >>>
    0;

  const chars = new Array(5);
  for (let i = 4; i >= 0; i--) {
    chars[i] = ALPHABET[value % 85];
    value = Math.floor(value / 85);
  }
  return chars.join('');
}

/**
 * Decode exactly 5 Z85 characters into 4 bytes.
 *
 * @param {string} input - exactly 5 characters from the Z85 alphabet
 * @returns {Uint8Array} 4 bytes
 */
export function decodeBlock(input) {
  if (typeof input !== 'string') {
    throw new TypeError('input must be a string');
  }
  if (input.length !== 5) {
    throw new RangeError('decodeBlock requires exactly 5 characters');
  }

  let value = 0;
  for (let i = 0; i < 5; i++) {
    const code = input.charCodeAt(i);
    const digit = DECODE_MAP.get(code);
    if (digit === undefined) {
      throw new RangeError(
        `invalid Z85 character at index ${i}: '${input[i]}'`,
      );
    }
    value = value * 85 + digit;
  }

  if (value > 0xffffffff) {
    // A well-formed 5-digit base-85 number maxes at 85^5-1 = 4437053248,
    // which exceeds 2^32. Only inputs that would overflow a 32-bit word are
    // rejected, matching the Z85 constraint.
    throw new RangeError('Z85 group decodes to a value exceeding 32 bits');
  }

  value = value >>> 0;
  const out = new Uint8Array(4);
  out[0] = (value >>> 24) & 0xff;
  out[1] = (value >>> 16) & 0xff;
  out[2] = (value >>> 8) & 0xff;
  out[3] = value & 0xff;
  return out;
}

/**
 * Encode an arbitrary-length byte array into a Z85 string.
 *
 * Z85 requires 4-byte aligned input. Rather than silently truncating or
 * inventing a side channel, we pad the final group with zero bytes and append
 * a single decimal digit recording how many of those trailing bytes were
 * padding (0-3). This keeps the output a plain string with no external state,
 * at the cost of one character of overhead on non-aligned inputs.
 *
 * @param {Uint8Array} input
 * @returns {string}
 */
export function encode(input) {
  if (!(input instanceof Uint8Array)) {
    throw new TypeError('input must be a Uint8Array');
  }

  const remainder = input.length % 4;
  const padCount = remainder === 0 ? 0 : 4 - remainder;

  let padded;
  if (padCount === 0) {
    padded = input;
  } else {
    padded = new Uint8Array(input.length + padCount);
    padded.set(input);
  }

  let out = '';
  for (let i = 0; i < padded.length; i += 4) {
    out += encodeBlock(padded.subarray(i, i + 4));
  }
  out += String(padCount);
  return out;
}

/**
 * Decode a Z85 string produced by `encode` back into the original bytes.
 *
 * The final character is the padding count (0-3). We verify the body length
 * is consistent with it before decoding to fail fast on truncated or
 * corrupted input.
 *
 * @param {string} input
 * @returns {Uint8Array}
 */
export function decode(input) {
  if (typeof input !== 'string') {
    throw new TypeError('input must be a string');
  }
  if (input.length === 0) {
    throw new RangeError('input is too short to contain a padding digit');
  }

  const padChar = input[input.length - 1];
  const padCount = padChar.charCodeAt(0) - 48;
  if (padCount < 0 || padCount > 3) {
    throw new RangeError(
      `invalid padding suffix: '${padChar}' (expected '0'-'3')`,
    );
  }

  const body = input.slice(0, -1);
  if (body.length % 5 !== 0) {
    throw new RangeError(
      `encoded body length ${body.length} is not a multiple of 5`,
    );
  }

  const groupCount = body.length / 5;
  // Only the final group can carry padding; if padCount > 0 we must have at
  // least one group, and if there are zero groups then padCount must be 0.
  if (padCount > 0 && groupCount === 0) {
    throw new RangeError('padding suffix present but no data groups');
  }

  const out = new Uint8Array(groupCount * 4);
  for (let i = 0; i < groupCount; i++) {
    const block = decodeBlock(body.slice(i * 5, i * 5 + 5));
    out.set(block, i * 4);
  }

  if (padCount > 0) {
    return out.subarray(0, out.length - padCount);
  }
  return out;
}

export const alphabet = ALPHABET;
