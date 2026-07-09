import type { Context } from "hono";
import { loadConfig } from "../config.js";
import { scanDevices } from "../transport/native-ble.js";

export function createScanRoute() {
  const config = loadConfig();

  return async (context: Context) => {
    try {
      const devices = await scanDevices({
        namePrefix: config.printerNamePrefix,
      });

      return context.json({
        success: true,
        count: devices.length,
        devices,
        hint:
          devices.length > 0
            ? "Set PRINTER_ADDRESS to each device's connect_id. On macOS this is a Core Bluetooth UUID (address is often empty)."
            : "No YHK devices seen. Power on the printer, disconnect it from phone apps, and ensure it is paired in System Settings → Bluetooth.",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "BLE scan failed.";
      return context.json(
        {
          success: false,
          error: message,
          devices: [],
        },
        500,
      );
    }
  };
}
