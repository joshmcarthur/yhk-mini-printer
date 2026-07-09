import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { loadConfig } from "./config.js";
import { AsyncMutex } from "./print-mutex.js";
import { createHealthRoute } from "./routes/health.js";
import { createPrintRoute, createRawPrintRoute } from "./routes/print.js";
import { createScanRoute } from "./routes/scan.js";
import {
  NativeBleTransport,
  PrinterTransportError,
} from "./transport/native-ble.js";

const config = loadConfig();
const app = new Hono();
const printMutex = new AsyncMutex();

let transport: NativeBleTransport | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;

function getTransport(): NativeBleTransport | null {
  return transport;
}

async function connectPrinter(): Promise<void> {
  if (transport?.connected) {
    return;
  }

  if (transport) {
    await transport.disconnect().catch(() => undefined);
    transport = null;
  }

  const nextTransport = new NativeBleTransport({
    address: config.printerAddress,
    namePrefix: config.printerNamePrefix,
    chunkDelayMs: config.bleChunkDelayMs,
  });

  try {
    await nextTransport.connect();
    transport = nextTransport;
    console.log(
      `Printer ready: ${transport.deviceName ?? "unknown"} (${transport.deviceAddress ?? "no address"})`,
    );
  } catch (error) {
    await nextTransport.disconnect().catch(() => undefined);
    throw error;
  }
}

function scheduleReconnect(delayMs = 5_000): void {
  if (reconnectTimer) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectPrinter().catch((error) => {
      const message =
        error instanceof Error ? error.message : "Unknown connection error";
      console.error(`Printer reconnect failed: ${message}`);
      scheduleReconnect(Math.min(delayMs * 2, 60_000));
    });
  }, delayMs);
}

app.get("/health", createHealthRoute(getTransport));
app.get("/scan", createScanRoute());
app.post("/print", createPrintRoute({ getTransport, mutex: printMutex }));
app.post(
  "/print/raw",
  createRawPrintRoute({ getTransport, mutex: printMutex }),
);

serve(
  {
    fetch: app.fetch,
    hostname: config.host,
    port: config.port,
  },
  (info) => {
    console.log(`Print server listening on http://${info.address}:${info.port}`);
  },
);

void connectPrinter().catch((error) => {
  if (error instanceof PrinterTransportError) {
    console.error(`Printer connection failed: ${error.message}`);
    if (!config.printerAddress) {
      console.error(
        "Tip: run a scan, note the BLE address from the error/logs, then set PRINTER_ADDRESS.",
      );
    }
    scheduleReconnect();
    return;
  }

  console.error("Unexpected printer connection error:", error);
  scheduleReconnect();
});

process.on("SIGINT", () => {
  void (async () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
    await transport?.disconnect();
    process.exit(0);
  })();
});
