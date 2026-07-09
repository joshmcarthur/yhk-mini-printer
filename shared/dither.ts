export function thresholdGrayscale(grayscale: number): boolean {
  return grayscale < 128;
}

export function floydSteinbergDither(
  width: number,
  height: number,
  grayscale: Float32Array,
): boolean[][] {
  const pixels: boolean[][] = [];
  const errors = new Float32Array(grayscale);

  for (let y = 0; y < height; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const oldPixel = errors[index] ?? 0;
      const newPixel = oldPixel < 128 ? 0 : 255;
      const error = oldPixel - newPixel;
      row.push(newPixel === 0);

      if (x + 1 < width) {
        errors[index + 1] = (errors[index + 1] ?? 0) + (error * 7) / 16;
      }
      if (y + 1 < height) {
        if (x > 0) {
          errors[index + width - 1] =
            (errors[index + width - 1] ?? 0) + (error * 3) / 16;
        }
        errors[index + width] = (errors[index + width] ?? 0) + (error * 5) / 16;
        if (x + 1 < width) {
          errors[index + width + 1] =
            (errors[index + width + 1] ?? 0) + (error * 1) / 16;
        }
      }
    }
    pixels.push(row);
  }

  return pixels;
}

export function imageDataToGrayscale(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Float32Array {
  const grayscale = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const red = data[index] ?? 0;
      const green = data[index + 1] ?? 0;
      const blue = data[index + 2] ?? 0;
      grayscale[y * width + x] = 0.299 * red + 0.587 * green + 0.114 * blue;
    }
  }

  return grayscale;
}

export function thresholdImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): boolean[][] {
  const pixels: boolean[][] = [];

  for (let y = 0; y < height; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const red = data[index] ?? 0;
      const green = data[index + 1] ?? 0;
      const blue = data[index + 2] ?? 0;
      const value = 0.299 * red + 0.587 * green + 0.114 * blue;
      row.push(thresholdGrayscale(value));
    }
    pixels.push(row);
  }

  return pixels;
}

export function ditherImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): boolean[][] {
  const grayscale = imageDataToGrayscale(data, width, height);
  return floydSteinbergDither(width, height, grayscale);
}
