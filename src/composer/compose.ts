import QRCode from "qrcode";
import { DEFAULT_COMPOSE_FONT_SIZE, PRINTER_WIDTH } from "@shared/constants.ts";
import type {
  ComposerBlock,
  QrErrorCorrection,
} from "@shared/print-document.ts";
import { thresholdImageData } from "../image.ts";

export type { ComposerBlock, QrErrorCorrection } from "@shared/print-document.ts";

export interface ComposeResult {
  canvas: HTMLCanvasElement;
  pixels: boolean[][];
}

interface LayoutItem {
  kind: "title" | "text" | "qr" | "spacer";
  height: number;
  text?: string;
  font?: "normal" | "mono";
  maxLines?: number;
  qrData?: string;
  qrSize?: number;
  qrEcc?: QrErrorCorrection;
  spacerPx?: number;
}

const PADDING = 16;

export interface ComposeOptions {
  width?: number;
  fontSize?: number;
}

interface Typography {
  titleFont: string;
  textFont: string;
  monoFont: string;
  titleLineHeight: number;
  lineHeight: number;
}

const DEFAULT_FONT_SIZE = DEFAULT_COMPOSE_FONT_SIZE;

function createTypography(fontSize: number): Typography {
  const monoSize = Math.max(16, fontSize - 2);
  const titleSize = fontSize + 6;

  return {
    titleFont: `bold ${titleSize}px monospace`,
    textFont: `${fontSize}px monospace`,
    monoFont: `${monoSize}px monospace`,
    titleLineHeight: Math.round(titleSize * 1.25),
    lineHeight: Math.round(fontSize * 1.3),
  };
}

function getContextFont(
  typography: Typography,
  font: "normal" | "mono" | "title",
): string {
  switch (font) {
    case "title":
      return typography.titleFont;
    case "mono":
      return typography.monoFont;
    case "normal":
      return typography.textFont;
  }
}

function wrapLines(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines?: number,
): string[] {
  const paragraphs = text.split("\n");
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let current = words[0] ?? "";
    for (const word of words.slice(1)) {
      const candidate = `${current} ${word}`;
      if (context.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
        if (maxLines !== undefined && lines.length >= maxLines) {
          return truncateLines(lines, maxLines, context);
        }
      }
    }

    lines.push(current);
    if (maxLines !== undefined && lines.length >= maxLines) {
      return truncateLines(lines, maxLines, context);
    }
  }

  return lines;
}

function truncateLines(
  lines: string[],
  maxLines: number,
  context: CanvasRenderingContext2D,
): string[] {
  const trimmed = lines.slice(0, maxLines);
  const lastIndex = trimmed.length - 1;
  let lastLine = trimmed[lastIndex] ?? "";
  const ellipsis = "…";

  while (
    lastLine.length > 0 &&
    context.measureText(`${lastLine}${ellipsis}`).width > context.canvas.width
  ) {
    lastLine = lastLine.slice(0, -1);
  }

  trimmed[lastIndex] = `${lastLine}${ellipsis}`;
  return trimmed;
}

function measureTextBlock(
  context: CanvasRenderingContext2D,
  typography: Typography,
  text: string,
  font: "normal" | "mono" | "title",
  maxWidth: number,
  maxLines?: number,
): { lines: string[]; height: number } {
  context.font = getContextFont(typography, font);
  const lineHeight =
    font === "title" ? typography.titleLineHeight : typography.lineHeight;
  const lines = wrapLines(context, text, maxWidth, maxLines);
  return {
    lines,
    height: lines.length * lineHeight,
  };
}

function buildLayout(
  context: CanvasRenderingContext2D,
  blocks: ComposerBlock[],
  width: number,
  typography: Typography,
): LayoutItem[] {
  const maxTextWidth = width - PADDING * 2;
  const layout: LayoutItem[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "title": {
        const measured = measureTextBlock(
          context,
          typography,
          block.text,
          "title",
          maxTextWidth,
        );
        layout.push({
          kind: "title",
          height: measured.height,
          text: measured.lines.join("\n"),
        });
        break;
      }
      case "text": {
        const font = block.font ?? "normal";
        const measured = measureTextBlock(
          context,
          typography,
          block.text,
          font === "mono" ? "mono" : "normal",
          maxTextWidth,
          block.maxLines,
        );
        layout.push({
          kind: "text",
          height: measured.height,
          text: measured.lines.join("\n"),
          font,
          maxLines: block.maxLines,
        });
        break;
      }
      case "qr":
        layout.push({
          kind: "qr",
          height: block.size ?? 240,
          qrData: block.data,
          qrSize: block.size ?? 240,
          qrEcc: block.ecc ?? "H",
        });
        break;
      case "spacer":
        layout.push({
          kind: "spacer",
          height: block.px,
          spacerPx: block.px,
        });
        break;
      case "image":
        throw new Error(
          "Image blocks are not supported in the browser composer yet.",
        );
      default: {
        const unreachable: never = block;
        throw new Error(`Unsupported composer block: ${String(unreachable)}`);
      }
    }
  }

  return layout;
}

async function drawQr(
  context: CanvasRenderingContext2D,
  data: string,
  x: number,
  y: number,
  size: number,
  ecc: QrErrorCorrection,
): Promise<void> {
  const qrCanvas = document.createElement("canvas");
  await QRCode.toCanvas(qrCanvas, data, {
    errorCorrectionLevel: ecc,
    margin: 4,
    width: size,
    color: {
      dark: "#000000",
      light: "#ffffff",
    },
  });

  context.drawImage(qrCanvas, x, y, size, size);
}

export async function compose(
  blocks: ComposerBlock[],
  options: ComposeOptions = {},
): Promise<ComposeResult> {
  const width = options.width ?? PRINTER_WIDTH;
  const typography = createTypography(options.fontSize ?? DEFAULT_FONT_SIZE);

  const measureCanvas = document.createElement("canvas");
  measureCanvas.width = width;
  const measureContext = measureCanvas.getContext("2d");
  if (!measureContext) {
    throw new Error("Canvas 2D context is not available.");
  }

  const layout = buildLayout(measureContext, blocks, width, typography);
  const contentHeight = layout.reduce((sum, item) => sum + item.height, 0);
  const height = Math.max(contentHeight + PADDING * 2, 1);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is not available.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  let y = PADDING;

  for (const item of layout) {
    switch (item.kind) {
      case "title": {
        context.font = typography.titleFont;
        context.fillStyle = "#000000";
        context.textAlign = "center";
        context.textBaseline = "top";
        const lines = (item.text ?? "").split("\n");
        for (const line of lines) {
          context.fillText(line, width / 2, y);
          y += typography.titleLineHeight;
        }
        break;
      }
      case "text": {
        const font = item.font === "mono" ? "mono" : "normal";
        context.font = getContextFont(typography, font);
        context.fillStyle = "#000000";
        context.textAlign = "center";
        context.textBaseline = "top";
        const lines = (item.text ?? "").split("\n");
        for (const line of lines) {
          context.fillText(line, width / 2, y);
          y += typography.lineHeight;
        }
        break;
      }
      case "qr": {
        const qrSize = item.qrSize ?? 240;
        const qrX = (width - qrSize) / 2;
        await drawQr(
          context,
          item.qrData ?? "",
          qrX,
          y,
          qrSize,
          item.qrEcc ?? "H",
        );
        y += qrSize;
        break;
      }
      case "spacer": {
        y += item.spacerPx ?? item.height;
        break;
      }
    }
  }

  const imageData = context.getImageData(0, 0, width, height);
  const pixels = thresholdImageData(imageData);

  return { canvas, pixels };
}

export function truncatePayloadPreview(payload: string, maxLength = 42): string {
  const singleLine = payload.replace(/\s+/g, " ").trim();
  if (singleLine.length <= maxLength) {
    return singleLine;
  }

  return `${singleLine.slice(0, maxLength - 1)}…`;
}

export function buildQrBlocks(options: {
  payload: string;
  caption?: string;
  qrSize?: number;
  includeTimestamp?: boolean;
}): ComposerBlock[] {
  const blocks: ComposerBlock[] = [];

  if (options.caption?.trim()) {
    blocks.push({
      type: "text",
      text: options.caption.trim(),
      font: "normal",
      maxLines: 2,
    });
    blocks.push({ type: "spacer", px: 8 });
  }

  blocks.push({
    type: "qr",
    data: options.payload,
    size: options.qrSize ?? 240,
    ecc: "H",
  });
  blocks.push({ type: "spacer", px: 8 });
  blocks.push({
    type: "text",
    text: truncatePayloadPreview(options.payload),
    font: "mono",
  });

  if (options.includeTimestamp !== false) {
    blocks.push({ type: "spacer", px: 6 });
    blocks.push({
      type: "text",
      text: new Date().toLocaleString(),
      font: "mono",
    });
  }

  return blocks;
}
