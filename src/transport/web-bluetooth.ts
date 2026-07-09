import {
  PrinterTransportError,
  sendChunked,
  type PrinterTransport,
} from "../transport.ts";
import {
  ISSC_RX_CHARACTERISTIC_UUID,
  ISSC_SERVICE_UUID,
  ISSC_TX_CHARACTERISTIC_UUID,
} from "@shared/ble-uuids.ts";

export {
  ISSC_RX_CHARACTERISTIC_UUID,
  ISSC_SERVICE_UUID,
  ISSC_TX_CHARACTERISTIC_UUID,
} from "@shared/ble-uuids.ts";

function assertWebBluetoothAvailable(): void {
  if (!navigator.bluetooth) {
    throw new PrinterTransportError(
      "Web Bluetooth is not available in this browser. Use Chrome or Edge on desktop or Android.",
      "bluetooth-unavailable",
    );
  }
}

export class WebBluetoothTransport implements PrinterTransport {
  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;

  get connected(): boolean {
    return (
      this.device?.gatt?.connected === true && this.characteristic !== null
    );
  }

  async connect(): Promise<void> {
    assertWebBluetoothAvailable();

    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: "YHK" }],
        optionalServices: [ISSC_SERVICE_UUID],
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") {
        throw new PrinterTransportError(
          "No printer selected.",
          "user-cancelled",
        );
      }

      if (error instanceof DOMException && error.name === "SecurityError") {
        throw new PrinterTransportError(
          "Web Bluetooth requires HTTPS or localhost.",
          "bluetooth-unavailable",
        );
      }

      throw error;
    }

    const server = this.device.gatt;
    if (!server) {
      throw new PrinterTransportError(
        "Printer does not expose a GATT server.",
        "characteristic-not-found",
      );
    }

    const gatt = await server.connect();
    const service = await gatt.getPrimaryService(ISSC_SERVICE_UUID);
    this.characteristic = await service.getCharacteristic(
      ISSC_TX_CHARACTERISTIC_UUID,
    );

    try {
      const notifyCharacteristic = await service.getCharacteristic(
        ISSC_RX_CHARACTERISTIC_UUID,
      );
      await notifyCharacteristic.startNotifications();
    } catch {
      // Some printers still print without notifications enabled.
    }
  }

  async disconnect(): Promise<void> {
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }

    this.characteristic = null;
    this.device = null;
  }

  async send(data: Uint8Array): Promise<void> {
    const characteristic = this.characteristic;
    if (!characteristic) {
      throw new PrinterTransportError(
        "Printer is not connected.",
        "not-connected",
      );
    }

    await sendChunked((chunk) => {
      return characteristic.writeValueWithoutResponse(
        new Uint8Array(chunk),
      );
    }, data);
  }

  get deviceName(): string | undefined {
    return this.device?.name ?? undefined;
  }
}
