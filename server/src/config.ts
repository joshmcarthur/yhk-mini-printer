export interface ServerConfig {
  port: number;
  host: string;
  printerAddress: string | undefined;
  printerNamePrefix: string;
  bleChunkDelayMs: number;
}

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid PORT value: ${value}`);
  }

  return parsed;
}

function parseDelay(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid BLE_CHUNK_DELAY_MS value: ${value}`);
  }

  return parsed;
}

export function loadConfig(): ServerConfig {
  return {
    port: parsePort(process.env.PORT, 8787),
    host: process.env.PRINT_SERVER_HOST ?? "127.0.0.1",
    printerAddress: process.env.PRINTER_ADDRESS?.trim() || undefined,
    printerNamePrefix: process.env.PRINTER_NAME_PREFIX ?? "YHK",
    bleChunkDelayMs: parseDelay(process.env.BLE_CHUNK_DELAY_MS, 40),
  };
}
