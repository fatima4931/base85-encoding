Base85 encoding and decoding for binary data, using the Z85 (ZeroMQ RFC 32) alphabet. Encodes 4 bytes into 5 ASCII characters — denser than Base64's 3-in-4 — and exposes both block-level and padded APIs for arbitrary input.

```js
import { encode, decode } from './src/index.js';

const bytes = new Uint8Array([1, 2, 3, 4, 5]);
const text = encode(bytes);     // Z85-encoded string with padding suffix digit
const back = decode(text);     // Uint8Array [1, 2, 3, 4, 5]
```

## Why this exists

Base64 is ubiquitous but wasteful: it expands data by 33%. Base85 expands it by only 25%, which matters when encoding large blobs for JSON config files, source-code embedding, or any text-only channel where every byte travels.

This library implements the Z85 alphabet rather than Adobe Ascii85. The trade-off: Z85 uses a fixed, unreserved character set that passes cleanly through JSON, XML, and most URI schemes without escaping. Ascii85 is slightly more compact in some contexts but includes `\"`, `'`, `\\`, `<`, `>`, and `&`, which force escaping in exactly the text formats Base85 is most often used for — negating the density advantage.

## The edge you will hit

Z85 requires input whose length is a multiple of 4 bytes. The `encodeBlock` and `decodeBlock` functions enforce this strictly. The higher-level `encode` and `decode` functions handle arbitrary-length input by zero-padding the final group and appending a single decimal digit (0–3) recording how many padding bytes were added. That suffix is part of the string and must travel with it; stripping it will break decoding.

### Exported names

- `encode(Uint8Array) -> string`
- `decode(string) -> Uint8Array`
- `encodeBlock(Uint8Array(4)) -> string` (5 chars)
- `decodeBlock(string(5)) -> Uint8Array` (4 bytes)
- `alphabet` — the 85-character Z85 string

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

## Limitations

Values are coerced to floats, so very large integers lose precision. If you need
exact integer aggregates over a window, this is the wrong tool.

