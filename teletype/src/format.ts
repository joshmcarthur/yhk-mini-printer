import {
  MAX_BLOCKS,
  truncateTextLine,
  type PrintBlock,
} from "@yhk/shared/print-document";
import type { TeletypeKind } from "./filter.js";
import { formatNodeId, type MeshtasticTextMessage } from "./meshtastic.js";

export const SEPARATOR = "--------------------------------";

const MAX_HEADER_BLOCKS = 6;
const FOOTER_RESERVED_BLOCKS = 2;

function maxBodyParagraphs(): number {
  return Math.max(1, MAX_BLOCKS - MAX_HEADER_BLOCKS - FOOTER_RESERVED_BLOCKS);
}

function monoLine(text: string): PrintBlock {
  return { type: "text", text: truncateTextLine(text), font: "mono" };
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function splitBodyParagraphs(body: string): string[] {
  return body.split("\n");
}

export function formatTeletypeSlip(
  msg: MeshtasticTextMessage,
  kind: TeletypeKind,
  body: string,
): PrintBlock[] {
  const blocks: PrintBlock[] = [
    monoLine(SEPARATOR),
    monoLine(kind),
    monoLine(`from ${formatNodeId(msg)}`),
  ];

  if (msg.timestamp !== undefined) {
    blocks.push(monoLine(formatTimestamp(msg.timestamp)));
  }

  blocks.push(monoLine(SEPARATOR));
  blocks.push({ type: "spacer", px: 8 });

  const paragraphs = splitBodyParagraphs(body);
  const limit = maxBodyParagraphs();
  const included = paragraphs.slice(0, limit);
  const truncated = paragraphs.length > limit;

  for (const paragraph of included) {
    blocks.push({ type: "text", text: paragraph, font: "normal" });
  }

  if (truncated) {
    blocks.push(monoLine("…"));
  }

  blocks.push(monoLine(SEPARATOR));
  return blocks;
}
