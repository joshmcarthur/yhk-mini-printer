export type QrErrorCorrection = "M" | "Q" | "H";

export type PrintBlock =
  | { type: "title"; text: string }
  | { type: "text"; text: string; font?: "normal" | "mono"; maxLines?: number }
  | { type: "qr"; data: string; size?: number; ecc?: QrErrorCorrection }
  | {
      type: "image";
      url?: string;
      base64?: string;
      dither?: boolean;
    }
  | { type: "spacer"; px: number };

/** Alias used by the browser composer. */
export type ComposerBlock = PrintBlock;

export interface PrintRequest {
  blocks: PrintBlock[];
}

export interface PrintShorthandRequest {
  title?: string;
  lines?: string[];
  qr?: string;
  footer?: string;
  images?: string[];
}

export type NormalizedPrintRequest = PrintShorthandRequest & {
  blocks?: PrintBlock[];
};

export const MAX_BLOCKS = 30;
export const MAX_TEXT_CHARS = 80;
export const MAX_IMAGE_BYTES = 1_048_576;

export function truncateTextLine(text: string, maxLength = MAX_TEXT_CHARS): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  if (singleLine.length <= maxLength) {
    return singleLine;
  }

  return `${singleLine.slice(0, maxLength - 1)}…`;
}

function isUrlReference(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function shorthandImageBlock(reference: string): PrintBlock {
  if (isUrlReference(reference)) {
    return { type: "image", url: reference };
  }

  return { type: "image", base64: reference };
}

export function normalizePrintRequest(
  request: NormalizedPrintRequest,
): PrintBlock[] {
  if (request.blocks && request.blocks.length > 0) {
    return request.blocks;
  }

  const blocks: PrintBlock[] = [];

  if (request.title?.trim()) {
    blocks.push({ type: "title", text: truncateTextLine(request.title) });
  }

  for (const line of request.lines ?? []) {
    blocks.push({
      type: "text",
      text: truncateTextLine(line),
      font: "mono",
    });
  }

  for (const image of request.images ?? []) {
    blocks.push(shorthandImageBlock(image));
  }

  if (request.qr?.trim()) {
    blocks.push({ type: "qr", data: request.qr.trim() });
  }

  if (request.footer?.trim()) {
    blocks.push({
      type: "text",
      text: truncateTextLine(request.footer),
      font: "mono",
    });
  }

  return blocks;
}

export function validatePrintBlocks(blocks: PrintBlock[]): string | null {
  if (blocks.length === 0) {
    return "Print document must include at least one block.";
  }

  if (blocks.length > MAX_BLOCKS) {
    return `Print document exceeds the ${MAX_BLOCKS}-block limit.`;
  }

  for (const block of blocks) {
    switch (block.type) {
      case "title":
      case "text":
        if (!block.text.trim()) {
          return `${block.type} blocks must include non-empty text.`;
        }
        break;
      case "qr":
        if (!block.data.trim()) {
          return "QR blocks must include non-empty data.";
        }
        break;
      case "image":
        if (!block.url && !block.base64) {
          return "Image blocks must include a url or base64 payload.";
        }
        if (block.url && block.base64) {
          return "Image blocks must include either url or base64, not both.";
        }
        break;
      case "spacer":
        if (block.px < 0) {
          return "Spacer blocks must use a non-negative pixel height.";
        }
        break;
      default: {
        const unreachable: never = block;
        return `Unsupported block type: ${String(unreachable)}`;
      }
    }
  }

  return null;
}
