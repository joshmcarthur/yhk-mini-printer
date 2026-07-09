import type { Context } from "hono";
import type { NativeBleTransport } from "../transport/native-ble.js";

export function createHealthRoute(getTransport: () => NativeBleTransport | null) {
  return (context: Context) => {
    const transport = getTransport();
    const printerReady = transport?.connected ?? false;
    const bleLinked = transport?.bleLinked ?? false;

    return context.json({
      status: "ok",
      printer_connected: printerReady,
      ble_linked: bleLinked,
      printer_ready: printerReady,
      printer_name: printerReady ? (transport?.deviceName ?? null) : null,
      printer_address: printerReady ? (transport?.deviceAddress ?? null) : null,
      printer_connect_id: printerReady ? (transport?.deviceAddress ?? null) : null,
    });
  };
}
