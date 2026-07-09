import {
  BLE_CHUNK_DELAY_MS,
  BLE_CHUNK_SIZE,
  BLE_FLUSH_DELAY_MS,
} from "./constants.js";

export interface SendChunkedOptions {
  chunkSize?: number;
  delayMs?: number;
  flushDelayMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function sendChunked(
  write: (chunk: Uint8Array) => Promise<void>,
  data: Uint8Array,
  options: SendChunkedOptions = {},
): Promise<void> {
  const chunkSize = options.chunkSize ?? BLE_CHUNK_SIZE;
  const delayMs = options.delayMs ?? BLE_CHUNK_DELAY_MS;
  const flushDelayMs = options.flushDelayMs ?? BLE_FLUSH_DELAY_MS;

  for (let i = 0; i < data.length; i += chunkSize) {
    await write(data.slice(i, i + chunkSize));

    if (delayMs > 0 && i + chunkSize < data.length) {
      await sleep(delayMs);
    }
  }

  if (flushDelayMs > 0) {
    await sleep(flushDelayMs);
  }
}
