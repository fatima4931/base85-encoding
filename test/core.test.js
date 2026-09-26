import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { encode, decode, encodeBlock, decodeBlock, alphabet } from '../src/index.js';

/** @param {number[]} bytes */
const u8 = (bytes) => new Uint8Array(bytes);

const roundTrip = (label, bytes) => {
  it(`round-trips ${label}`, () => {
    const encoded = encode(u8(bytes));
    const decoded = decode(encoded);
    assert.deepEqual(Array.from(decoded), bytes);
  });
};

describe('alphabet', () => {
  it('has exactly 85 characters', () => {
    assert.equal(alphabet.length, 85);
  });

  it('contains no duplicate characters', () => {
    const seen = new Set();
    for (const ch of alphabet) {
      assert.ok(!seen.has(ch), `duplicate character: ${ch}`);
      seen.add(ch);
    }
  });
});

describe('encodeBlock', () => {
  it('encodes four zero bytes as five zero-digits', () => {
    assert.equal(encodeBlock(u8([0, 0, 0, 0])), '00000');
  });

  it('encodes the maximum 4-byte value', () => {
    // 0xffffffff = 4294967295, which in base-85 is a known large value;
    // the last (most significant) digit is floor(4294967295 / 85^4) = 82.
    assert.equal(encodeBlock(u8([0xff, 0xff, 0xff, 0xff])).length, 5);
    assert.equal(
      alphabet.indexOf(encodeBlock(u8([0xff, 0xff, 0xff, 0xff]))[0]),
      82,
    );
  });

  it('rejects input that is not a Uint8Array', () => {
    assert.throws(() => encodeBlock([0, 0, 0, 0]), TypeError);
  });

  it('rejects input whose length is not 4', () => {
    assert.throws(() => encodeBlock(u8([0, 0, 0])), RangeError);
    assert.throws(() => encodeBlock(u8([0, 0, 0, 0, 0])), RangeError);
  });
});

describe('decodeBlock', () => {
  it('decodes five zero-digits to four zero bytes', () => {
    assert.deepEqual(decodeBlock('00000'), u8([0, 0, 0, 0]));
  });

  it('is the inverse of encodeBlock for several values', () => {
    const samples = [
      [1, 2, 3, 4],
      [255, 0, 128, 64],
      [0, 0, 0, 1],
      [0xff, 0xff, 0xff, 0xff],
    ];
    for (const bytes of samples) {
      assert.deepEqual(decodeBlock(encodeBlock(u8(bytes))), u8(bytes));
    }
  });

  it('rejects characters outside the alphabet', () => {
    assert.throws(() => decodeBlock('0000~'), RangeError);
  });

  it('rejects input whose length is not 5', () => {
    assert.throws(() => decodeBlock('0000'), RangeError);
    assert.throws(() => decodeBlock('000000'), RangeError);
  });
});

describe('encode/decode round-trip', () => {
  roundTrip('empty', []);
  roundTrip('one byte', [65]);
  roundTrip('two bytes', [255, 0]);
  roundTrip('three bytes', [1, 2, 3]);
  roundTrip('exactly four bytes', [10, 20, 30, 40]);
  roundTrip('five bytes', [10, 20, 30, 40, 50]);
  roundTrip('six bytes', [10, 20, 30, 40, 50, 60]);
  roundTrip('seven bytes', [10, 20, 30, 40, 50, 60, 70]);
  roundTrip('eight bytes (two full groups)', [1, 2, 3, 4, 5, 6, 7, 8]);
  roundTrip('longer mixed input', [
    0, 255, 16, 32, 64, 128, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  ]);
});

describe('encode output shape', () => {
  it('appends padding suffix 0 for aligned input', () => {
    assert.equal(encode(u8([1, 2, 3, 4])).slice(-1), '0');
  });

  it('appends the correct padding count for unaligned input', () => {
    assert.equal(encode(u8([1])).slice(-1), '3');
    assert.equal(encode(u8([1, 2])).slice(-1), '2');
    assert.equal(encode(u8([1, 2, 3])).slice(-1), '1');
  });
});

describe('decode error handling', () => {
  it('rejects an empty string', () => {
    assert.throws(() => decode(''), RangeError);
  });

  it('rejects a padding suffix outside 0-3', () => {
    assert.throws(() => decode('000004'), RangeError);
  });

  it('rejects a body whose length is not a multiple of 5', () => {
    assert.throws(() => decode('000004'), RangeError);
  });

  it('rejects a non-string input', () => {
    assert.throws(() => decode(42), TypeError);
  });

  it('rejects padding suffix present without any data groups', () => {
    assert.throws(() => decode('1'), RangeError);
  });
});
