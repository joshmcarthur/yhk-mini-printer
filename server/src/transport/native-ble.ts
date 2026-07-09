import { sendChunked } from "@yhk/shared/send-chunked";
import {
  deviceConnectId,
  deviceIdentifiersMatch,
  formatCoreBluetoothId,
} from "@yhk/shared/device-id";
import {
  ISSC_RX_CHARACTERISTIC_UUID,
  ISSC_SERVICE_UUID,
  ISSC_TX_CHARACTERISTIC_UUID,
  uuidMatches,
} from "./ble-uuids.js";

type Peripheral = import("@abandonware/noble").Peripheral;
type Characteristic = import("@abandonware/noble").Characteristic;

export interface DiscoveredDevice {
  id: string;
  address: string | null;
  connect_id: string;
  name: string | null;
  rssi: number;
}

interface NobleLike {
  state: string;
  on(event: string, listener: (...args: never[]) => void): void;
  removeListener(event: string, listener: (...args: never[]) => void): void;
  startScanning(serviceUuids: string[], allowDuplicates: boolean): void;
  stopScanning(): void;
}

let nobleModule: NobleLike | null = null;

async function loadNoble(): Promise<NobleLike> {
  if (nobleModule) {
    return nobleModule;
  }

  try {
    const module = await import("@abandonware/noble");
    nobleModule = module.default as unknown as NobleLike;
    return nobleModule;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load native BLE module.";
    throw new PrinterTransportError(
      `${message} Try Node 20 LTS if noble has no build for your Node version.`,
      "bluetooth-unavailable",
    );
  }
}

export interface PrinterTransport {
  readonly connected: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(data: Uint8Array): Promise<void>;
}

export class PrinterTransportError extends Error {
  constructor(
    message: string,
    readonly code:
      | "bluetooth-unavailable"
      | "device-not-found"
      | "characteristic-not-found"
      | "not-connected",
  ) {
    super(message);
    this.name = "PrinterTransportError";
  }
}

function toDiscoveredDevice(peripheral: Peripheral): DiscoveredDevice {
  const id = formatCoreBluetoothId(peripheral.id);
  const address = peripheral.address?.trim() || null;

  return {
    id,
    address,
    connect_id: deviceConnectId(peripheral.address ?? "", peripheral.id),
    name: peripheral.advertisement.localName ?? null,
    rssi: peripheral.rssi,
  };
}

function peripheralMatches(
  peripheral: Peripheral,
  options: { address?: string; namePrefix: string },
): { matchesPrefix: boolean; matchesAddress: boolean } {
  const name = peripheral.advertisement.localName ?? "";
  const matchesPrefix = name.startsWith(options.namePrefix);
  const matchesAddress =
    options.address !== undefined &&
    deviceIdentifiersMatch(
      deviceConnectId(peripheral.address ?? "", peripheral.id),
      options.address,
    );

  return { matchesPrefix, matchesAddress };
}

function formatDiscoveredDevice(peripheral: Peripheral): string {
  const device = toDiscoveredDevice(peripheral);
  return `${device.name ?? "unknown"} (${device.connect_id})`;
}

export async function scanDevices(options: {
  namePrefix?: string;
  timeoutMs?: number;
} = {}): Promise<DiscoveredDevice[]> {
  const noble = await loadNoble();
  await waitForPoweredOn(noble);

  const namePrefix = options.namePrefix ?? "YHK";
  const timeoutMs = options.timeoutMs ?? 12_000;

  return new Promise((resolve) => {
    const devices = new Map<string, DiscoveredDevice>();

    const timeout = setTimeout(() => {
      cleanup();
      resolve([...devices.values()].sort((a, b) => b.rssi - a.rssi));
    }, timeoutMs);

    function cleanup(): void {
      clearTimeout(timeout);
      noble.stopScanning();
      noble.removeListener("discover", onDiscover);
    }

    function onDiscover(peripheral: Peripheral): void {
      const name = peripheral.advertisement.localName ?? null;
      if (namePrefix && (!name || !name.startsWith(namePrefix))) {
        return;
      }

      const entry = toDiscoveredDevice(peripheral);
      devices.set(peripheral.id, entry);
      console.log(
        `BLE scan: ${entry.name ?? "unknown"} connect_id=${entry.connect_id} rssi=${entry.rssi}`,
      );
    }

    noble.on("discover", onDiscover);
    console.log(
      `BLE scan started (${timeoutMs / 1000}s, name prefix "${namePrefix}", no service filter)...`,
    );
    noble.startScanning([], false);
  });
}

function waitForPoweredOn(noble: NobleLike): Promise<void> {
  return new Promise((resolve, reject) => {
    if (noble.state === "poweredOn") {
      resolve();
      return;
    }

    const timeout = setTimeout(() => {
      noble.removeListener("stateChange", onStateChange);
      reject(
        new PrinterTransportError(
          `Bluetooth adapter is ${noble.state}. Enable Bluetooth and retry.`,
          "bluetooth-unavailable",
        ),
      );
    }, 15_000);

    function onStateChange(state: string): void {
      if (state === "poweredOn") {
        clearTimeout(timeout);
        noble.removeListener("stateChange", onStateChange);
        resolve();
      }
    }

    noble.on("stateChange", onStateChange);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

type NobleFull = NobleLike & {
  connect: (peripheralUuid: string) => void;
  _peripherals?: Record<string, Peripheral>;
};

function findKnownPeripheral(
  noble: NobleFull,
  deviceId: string,
): Peripheral | undefined {
  return Object.values(noble._peripherals ?? {}).find((peripheral) =>
    deviceIdentifiersMatch(
      deviceConnectId(peripheral.address ?? "", peripheral.id),
      deviceId,
    ),
  );
}

async function linkPeripheral(peripheral: Peripheral): Promise<void> {
  if (peripheral.state === "connected") {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    peripheral.connect((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function tryConnectByKnownId(
  noble: NobleFull,
  deviceId: string,
): Promise<Peripheral | null> {
  const formattedId = formatCoreBluetoothId(deviceId);
  const cached = findKnownPeripheral(noble, deviceId);

  if (cached) {
    console.log(`BLE retrieve: using cached peripheral ${formattedId}`);
    await linkPeripheral(cached);
    return cached;
  }

  console.log(`BLE retrieve: connecting to known device ${formattedId}`);
  noble.connect(formattedId);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await sleep(500);
    const peripheral = findKnownPeripheral(noble, deviceId);
    if (!peripheral) {
      continue;
    }
    if (peripheral.state === "connected") {
      return peripheral;
    }
    if (peripheral.state !== "connecting") {
      await linkPeripheral(peripheral);
      return peripheral;
    }
  }

  return null;
}

function scanForPeripheral(
  noble: NobleLike,
  options: {
    address?: string;
    namePrefix: string;
    timeoutMs?: number;
  },
): Promise<Peripheral> {
  return new Promise((resolve, reject) => {
    const timeoutMs = options.timeoutMs ?? 20_000;
    const configuredId = options.address?.trim() || undefined;
    const discovered: Peripheral[] = [];

    const timeout = setTimeout(() => {
      cleanup();
      if (discovered.length > 0) {
        const listings = discovered.map(formatDiscoveredDevice).join("; ");
        reject(
          new PrinterTransportError(
            configuredId
              ? `Printer ${configuredId} not found. Nearby YHK devices: ${listings}.`
              : `Multiple YHK printers found: ${listings}. Set PRINTER_ADDRESS to connect_id from /scan.`,
            "device-not-found",
          ),
        );
        return;
      }

      reject(
        new PrinterTransportError(
          configuredId
            ? `Printer with id ${configuredId} was not found during scan.`
            : `No printers with prefix ${options.namePrefix} were found. Ensure the printer is on, not connected to a phone, and paired in System Settings → Bluetooth.`,
          "device-not-found",
        ),
      );
    }, timeoutMs);

    function cleanup(): void {
      clearTimeout(timeout);
      noble.stopScanning();
      noble.removeListener("discover", onDiscover);
    }

    function onDiscover(peripheral: Peripheral): void {
      const { matchesPrefix, matchesAddress } = peripheralMatches(peripheral, {
        address: options.address,
        namePrefix: options.namePrefix,
      });

      if (!matchesPrefix && !matchesAddress) {
        return;
      }

      console.log(
        `BLE discover: ${formatDiscoveredDevice(peripheral)} rssi=${peripheral.rssi}`,
      );

      if (
        matchesPrefix &&
        !discovered.some((item) => item.id === peripheral.id)
      ) {
        discovered.push(peripheral);
      }

      if (matchesAddress) {
        cleanup();
        resolve(peripheral);
        return;
      }

      // No PRINTER_ADDRESS: connect to the first matching YHK device.
      if (matchesPrefix && !configuredId) {
        cleanup();
        resolve(peripheral);
      }
    }

    noble.on("discover", onDiscover);
    console.log(
      `BLE connect scan started (${timeoutMs / 1000}s, prefix "${options.namePrefix}"${configuredId ? `, id ${formatCoreBluetoothId(configuredId)}` : ""})...`,
    );
    noble.startScanning([], false);
  });
}

async function disconnectPeripheral(peripheral: Peripheral): Promise<void> {
  if (peripheral.state !== "connected") {
    return;
  }

  await new Promise<void>((resolve) => {
    peripheral.disconnect(() => resolve());
  });
}

async function connectPeripheral(peripheral: Peripheral): Promise<{
  peripheral: Peripheral;
  characteristic: Characteristic;
}> {
  await new Promise<void>((resolve, reject) => {
    peripheral.connect((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  console.log(
    `BLE linked to ${peripheral.advertisement.localName ?? "printer"} (${peripheral.address})`,
  );

  try {
    return await setupPrinterSession(peripheral);
  } catch (error) {
    console.error("Printer setup failed after BLE link; disconnecting.");
    await disconnectPeripheral(peripheral).catch(() => undefined);
    throw error;
  }
}

async function setupPrinterSession(peripheral: Peripheral): Promise<{
  peripheral: Peripheral;
  characteristic: Characteristic;
}> {
  const services = await new Promise<import("@abandonware/noble").Service[]>(
    (resolve, reject) => {
      peripheral.discoverServices([ISSC_SERVICE_UUID], (error, discovered) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(discovered);
      });
    },
  );

  console.log(
    `BLE services: ${services.map((service) => service.uuid).join(", ") || "none"}`,
  );

  const isscService = services.find((service) =>
    uuidMatches(service.uuid, ISSC_SERVICE_UUID),
  );

  if (!isscService) {
    throw new PrinterTransportError(
      `ISSC service ${ISSC_SERVICE_UUID} not found.`,
      "characteristic-not-found",
    );
  }

  // Discover all characteristics on the service (nil filter), matching Web
  // Bluetooth's getCharacteristic() flow. Noble's filtered discover can return
  // nothing on macOS when passed an empty JS array instead of null.
  const characteristics = await new Promise<Characteristic[]>(
    (resolve, reject) => {
      isscService.discoverCharacteristics(undefined, (error, discovered) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(discovered);
      });
    },
  );

  for (const characteristic of characteristics) {
    console.log(
      `BLE characteristic: ${characteristic.uuid} properties=${characteristic.properties.join(",")}`,
    );
  }

  const txCharacteristic = findTxCharacteristic(characteristics);

  if (!txCharacteristic) {
    const listing = characteristics
      .map(
        (characteristic) =>
          `${characteristic.uuid} [${characteristic.properties.join(", ")}]`,
      )
      .join("; ");
    throw new PrinterTransportError(
      `Printer TX characteristic ${ISSC_TX_CHARACTERISTIC_UUID} not found. Discovered: ${listing || "none"}.`,
      "characteristic-not-found",
    );
  }

  const rxCharacteristic = characteristics.find((characteristic) =>
    uuidMatches(characteristic.uuid, ISSC_RX_CHARACTERISTIC_UUID),
  );

  if (rxCharacteristic) {
    await new Promise<void>((resolve) => {
      rxCharacteristic.subscribe((error) => {
        if (error) {
          resolve();
          return;
        }
        resolve();
      });
    });
  }

  console.log(
    `Printer ready via TX characteristic ${txCharacteristic.uuid} (${txCharacteristic.properties.join(", ")})`,
  );

  return { peripheral, characteristic: txCharacteristic };
}

function findTxCharacteristic(
  characteristics: Characteristic[],
): Characteristic | undefined {
  const byUuid = characteristics.find((characteristic) =>
    uuidMatches(characteristic.uuid, ISSC_TX_CHARACTERISTIC_UUID),
  );
  if (byUuid) {
    return byUuid;
  }

  return characteristics.find(
    (characteristic) =>
      characteristic.properties.includes("writeWithoutResponse") ||
      characteristic.properties.includes("write"),
  );
}

export interface NativeBleTransportOptions {
  address?: string;
  namePrefix?: string;
  chunkDelayMs?: number;
}

export class NativeBleTransport implements PrinterTransport {
  private peripheral: Peripheral | null = null;
  private characteristic: Characteristic | null = null;
  private readonly address?: string;
  private readonly namePrefix: string;
  private readonly chunkDelayMs?: number;

  constructor(options: NativeBleTransportOptions = {}) {
    this.address = options.address;
    this.namePrefix = options.namePrefix ?? "YHK";
    this.chunkDelayMs = options.chunkDelayMs;
  }

  get connected(): boolean {
    return (
      this.peripheral?.state === "connected" && this.characteristic !== null
    );
  }

  /** True when noble has a GATT link, even if TX setup failed. */
  get bleLinked(): boolean {
    return this.peripheral?.state === "connected";
  }

  get deviceName(): string | undefined {
    return this.peripheral?.advertisement.localName ?? undefined;
  }

  get deviceAddress(): string | undefined {
    if (!this.peripheral) {
      return undefined;
    }

    return deviceConnectId(this.peripheral.address ?? "", this.peripheral.id);
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    const noble = await loadNoble();
    await waitForPoweredOn(noble);
    const nobleFull = noble as NobleFull;

    let peripheral: Peripheral | null = null;
    if (this.address?.trim()) {
      peripheral = await tryConnectByKnownId(nobleFull, this.address.trim());
    }

    if (!peripheral) {
      peripheral = await scanForPeripheral(noble, {
        address: this.address,
        namePrefix: this.namePrefix,
      });
    }

    try {
      const connection = await connectPeripheral(peripheral);
      this.peripheral = connection.peripheral;
      this.characteristic = connection.characteristic;
    } catch (error) {
      this.peripheral = null;
      this.characteristic = null;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    const peripheral = this.peripheral;
    if (peripheral?.state === "connected") {
      await new Promise<void>((resolve) => {
        peripheral.disconnect(() => resolve());
      });
    }

    this.peripheral = null;
    this.characteristic = null;
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
      return new Promise<void>((resolve, reject) => {
        characteristic.write(Buffer.from(chunk), true, (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }, data, {
      delayMs: this.chunkDelayMs,
    });
  }
}
