import {
  extractTextBody,
  isBroadcastTo,
  type MeshtasticTextMessage,
} from "./meshtastic.js";

export type TeletypeKind = "CH0" | "DM";

export function shouldPrint(
  msg: MeshtasticTextMessage,
): { kind: TeletypeKind; body: string } | null {
  if (msg.type !== "text") {
    return null;
  }

  const body = extractTextBody(msg.payload);
  if (body === null) {
    return null;
  }

  const broadcast = isBroadcastTo(msg.to);

  if (!broadcast) {
    return { kind: "DM", body };
  }

  if (msg.channel === 0) {
    return { kind: "CH0", body };
  }

  return null;
}
