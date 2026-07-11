import { describe, it, expect } from 'vitest';
import { encodeWorldBinary, decodeWorldBinary } from '../src/persistence/WorldBinary';
import { packVoxel } from '../src/persistence/SaveTypes';
import { CHUNK_VOLUME } from '../src/core/constants';
import type { WorldDeltas, WorldMeta } from '../src/persistence/SaveTypes';

const META: WorldMeta = {
  seed: 1337,
  version: 5,
  preset: 'flat',
  title: 'Bin World',
  spawn: { x: 1, y: 70, z: 2 },
  look: { yaw: 0.5, pitch: -0.1 },
  landmarks: [{ name: 'Keep', x: 10, y: 70, z: 10 }],
  tour: [{ name: 'Gate', x: 0, y: 70, z: 0 }],
};

const anyId = { isValidBlockId: () => true };

function sampleDeltas(): WorldDeltas {
  return new Map([
    [
      '-3,7',
      new Map([
        [0, packVoxel(3, 0)],
        [CHUNK_VOLUME - 1, packVoxel(31, 6)],
        [977, packVoxel(255, 255)],
      ]),
    ],
    ['12,-40', new Map([[5, packVoxel(7, 0)]])],
  ]);
}

describe('WorldBinary round-trip', () => {
  it('meta and deltas survive encode → decode exactly', () => {
    const deltas = sampleDeltas();
    const decoded = decodeWorldBinary(encodeWorldBinary(META, deltas), anyId);
    expect(decoded.dropped).toBe(0);
    expect(decoded.meta).toEqual(META);
    expect(decoded.deltas).toEqual(deltas);
  });

  it('handles an empty world and missing meta', () => {
    const decoded = decodeWorldBinary(encodeWorldBinary(undefined, new Map()), anyId);
    expect(decoded.meta).toBeUndefined();
    expect(decoded.deltas.size).toBe(0);
  });

  it('drops entries whose block id the registry rejects', () => {
    const deltas: WorldDeltas = new Map([
      [
        '0,0',
        new Map([
          [1, packVoxel(2, 0)],
          [2, packVoxel(9, 0)],
        ]),
      ],
    ]);
    const decoded = decodeWorldBinary(encodeWorldBinary(META, deltas), {
      isValidBlockId: (id) => id === 2,
    });
    expect(decoded.dropped).toBe(1);
    expect(decoded.deltas.get('0,0')).toEqual(new Map([[1, packVoxel(2, 0)]]));
  });
});

describe('WorldBinary corruption fails closed', () => {
  it('rejects a non-VRW buffer', () => {
    expect(() =>
      decodeWorldBinary(new TextEncoder().encode('{"chunks":{}}').buffer, anyId),
    ).toThrow(/bad magic/);
  });

  it('rejects a truncated payload', () => {
    const buffer = encodeWorldBinary(META, sampleDeltas());
    expect(() => decodeWorldBinary(buffer.slice(0, buffer.byteLength - 8), anyId)).toThrow(
      /truncated payload/,
    );
  });

  it('rejects a tampered chunk directory (overlapping/out-of-range ranges)', () => {
    const buffer = encodeWorldBinary(META, sampleDeltas());
    const bytes = new Uint8Array(buffer);
    const headerLength = new DataView(buffer).getUint32(4, true);
    const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + headerLength))) as {
      chunks: Array<{ count: number }>;
    };
    header.chunks[0].count += 100; // directory now claims entries past the payload
    const newHeader = new TextEncoder().encode(JSON.stringify(header));
    // Re-encode with the tampered header (same-length guarantee not needed: rebuild the file).
    const payload = bytes.subarray((8 + headerLength + 3) & ~3);
    const out = new Uint8Array(((8 + newHeader.length + 3) & ~3) + payload.length);
    out.set(bytes.subarray(0, 4), 0);
    new DataView(out.buffer).setUint32(4, newHeader.length, true);
    out.set(newHeader, 8);
    out.set(payload, (8 + newHeader.length + 3) & ~3);
    expect(() => decodeWorldBinary(out.buffer, anyId)).toThrow(/malformed chunk directory/);
  });

  it('rejects a header that is not JSON', () => {
    const buffer = encodeWorldBinary(undefined, new Map());
    new Uint8Array(buffer)[9] = 0; // stomp a header byte
    expect(() => decodeWorldBinary(buffer, anyId)).toThrow(/header/);
  });
});
