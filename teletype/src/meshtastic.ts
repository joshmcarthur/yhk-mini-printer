export const BROADCAST_TO = 0xffffffff;

export interface MeshtasticTextMessage {
  id?: number;
  channel?: number;
  from: number;
  to?: number;
  type: string;
  payload: unknown;
  sender?: string;
  timestamp?: number;
}

export function isBroadcastTo(to: number | undefined): boolean {
  if (to === undefined) {
    return true;
  }
  return to === -1 || to === BROADCAST_TO || to === 4294967295;
}

export function extractTextBody(payload: unknown): string | null {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    return trimmed.length > 0 ? payload : null;
  }

  if (
    payload !== null &&
    typeof payload === "object" &&
    "text" in payload &&
    typeof (payload as { text: unknown }).text === "string"
  ) {
    const text = (payload as { text: string }).text;
    const trimmed = text.trim();
    return trimmed.length > 0 ? text : null;
  }

  return null;
}

export function parseMeshtasticJson(raw: string): MeshtasticTextMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (parsed === null || typeof parsed !== "object") {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  if (typeof record.type !== "string" || typeof record.from !== "number") {
    return null;
  }

  if (!("payload" in record)) {
    return null;
  }

  return {
    id: typeof record.id === "number" ? record.id : undefined,
    channel: typeof record.channel === "number" ? record.channel : undefined,
    from: record.from,
    to: typeof record.to === "number" ? record.to : undefined,
    type: record.type,
    payload: record.payload,
    sender: typeof record.sender === "string" ? record.sender : undefined,
    timestamp: typeof record.timestamp === "number" ? record.timestamp : undefined,
  };
}

export function formatNodeId(msg: MeshtasticTextMessage): string {
  if (msg.sender?.trim()) {
    return msg.sender.trim();
  }
  return `!${msg.from.toString(16)}`;
}

export function dedupeKey(msg: MeshtasticTextMessage, body: string): string {
  if (msg.id !== undefined) {
    return `id:${msg.id}`;
  }
  return `fb:${msg.from}|${msg.timestamp ?? ""}|${body}`;
}
