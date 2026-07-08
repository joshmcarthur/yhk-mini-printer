function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

export function init(): Uint8Array {
  return new Uint8Array([0x1b, 0x40]);
}

export function feedLines(lines: number): Uint8Array {
  return new Uint8Array([0x1b, 0x64, lines]);
}

export function lineFeeds(count: number): Uint8Array {
  return new Uint8Array(Array.from({ length: count }, () => 0x0a));
}

export function pixelsToBitmap(pixels: boolean[][]): {
  bitmap: Uint8Array;
  widthBytes: number;
  height: number;
} {
  const height = pixels.length;
  if (height === 0) {
    throw new Error("Image must have at least one row.");
  }

  const width = pixels[0]?.length ?? 0;
  if (width === 0) {
    throw new Error("Image must have at least one column.");
  }

  const widthBytes = Math.ceil(width / 8);
  const bitmap = new Uint8Array(widthBytes * height);

  for (let y = 0; y < height; y++) {
    const row = pixels[y];
    if (row.length !== width) {
      throw new Error(`Row ${y} has inconsistent width.`);
    }

    for (let x = 0; x < width; x++) {
      if (row[x]) {
        bitmap[y * widthBytes + (x >> 3)] |= 1 << (7 - (x & 7));
      }
    }
  }

  return { bitmap, widthBytes, height };
}

export function rasterImage(
  bitmap: Uint8Array,
  widthBytes: number,
  height: number,
): Uint8Array {
  const header = new Uint8Array([
    0x1d,
    0x76,
    0x30,
    0x00,
    widthBytes & 0xff,
    (widthBytes >> 8) & 0xff,
    height & 0xff,
    (height >> 8) & 0xff,
  ]);

  return concatBytes([header, bitmap]);
}

export function buildPrintJob(pixels: boolean[][]): Uint8Array {
  const { bitmap, widthBytes, height } = pixelsToBitmap(pixels);
  return concatBytes([
    init(),
    rasterImage(bitmap, widthBytes, height),
    feedLines(4),
    lineFeeds(3),
  ]);
}
