import { MAX_IMAGE_BYTES } from "@yhk/shared/print-document";

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\.0\.0\.0$/,
  /^\[::1\]$/,
  /^::1$/,
  /^fe80:/i,
  /^fc00:/i,
  /^fd00:/i,
];

function isPrivateHost(hostname: string): boolean {
  return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

export function assertSafeImageUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Image URL is invalid.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Image URLs must use HTTP or HTTPS.");
  }

  if (isPrivateHost(parsed.hostname)) {
    throw new Error("Image URLs targeting private networks are not allowed.");
  }

  return parsed;
}

export async function fetchImageBytes(url: string): Promise<Buffer> {
  const parsed = assertSafeImageUrl(url);
  const response = await fetch(parsed.toString());

  if (!response.ok) {
    throw new Error(`Failed to fetch image (${response.status}).`);
  }

  const contentLength = Number.parseInt(
    response.headers.get("content-length") ?? "0",
    10,
  );
  if (contentLength > MAX_IMAGE_BYTES) {
    throw new Error("Image exceeds the 1 MB size limit.");
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Image exceeds the 1 MB size limit.");
  }

  return Buffer.from(arrayBuffer);
}

export function decodeBase64Image(base64: string): Buffer {
  const payload = base64.includes(",")
    ? (base64.split(",")[1] ?? "")
    : base64;
  const buffer = Buffer.from(payload, "base64");

  if (buffer.byteLength === 0) {
    throw new Error("Base64 image payload is empty.");
  }

  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Image exceeds the 1 MB size limit.");
  }

  return buffer;
}
