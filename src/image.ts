export interface TestPatternResult {
  pixels: boolean[][];
  canvas: HTMLCanvasElement;
}

const DEFAULT_HEIGHT = 240;

export function generateTestPattern(
  width: number,
  height = DEFAULT_HEIGHT,
): TestPatternResult {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is not available.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  const cellSize = 16;
  for (let y = 0; y < height; y += cellSize) {
    for (let x = 0; x < width; x += cellSize) {
      const isDark =
        (Math.floor(x / cellSize) + Math.floor(y / cellSize)) % 2 === 0;
      if (isDark) {
        context.fillStyle = "#000000";
        context.fillRect(x, y, cellSize, cellSize);
      }
    }
  }

  context.strokeStyle = "#000000";
  context.lineWidth = 4;
  context.strokeRect(2, 2, width - 4, height - 4);

  context.fillStyle = "#000000";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "bold 36px monospace";
  context.fillText("YHK TEST", width / 2, height / 2 - 20);

  context.font = "16px monospace";
  context.fillText(new Date().toLocaleString(), width / 2, height / 2 + 24);

  const imageData = context.getImageData(0, 0, width, height);
  const pixels = thresholdImageData(imageData);

  return { pixels, canvas };
}

export function thresholdImageData(imageData: ImageData): boolean[][] {
  const { width, height, data } = imageData;
  const pixels: boolean[][] = [];

  for (let y = 0; y < height; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const red = data[index] ?? 0;
      const green = data[index + 1] ?? 0;
      const blue = data[index + 2] ?? 0;
      const grayscale = 0.299 * red + 0.587 * green + 0.114 * blue;
      row.push(grayscale < 128);
    }
    pixels.push(row);
  }

  return pixels;
}

export function drawPreview(
  target: HTMLCanvasElement,
  source: HTMLCanvasElement,
): void {
  target.width = source.width;
  target.height = source.height;

  const context = target.getContext("2d");
  if (!context) {
    throw new Error("Preview canvas 2D context is not available.");
  }

  context.clearRect(0, 0, target.width, target.height);
  context.drawImage(source, 0, 0);
}
