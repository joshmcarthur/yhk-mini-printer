import { PrinterTransportError } from "../transport.ts";
import {
  isMacAddress,
  normalizeBleAddress,
  type WebBluetoothTransport,
} from "../transport/web-bluetooth.ts";

export interface DeviceInfoElements {
  container: HTMLElement;
  addressText: HTMLElement;
  copyButton: HTMLButtonElement;
  hintText: HTMLElement;
  labelText: HTMLElement;
}

export interface ConnectionElements {
  connectButton: HTMLButtonElement;
  disconnectButton: HTMLButtonElement;
  connectionStatus: HTMLParagraphElement;
  logElement: HTMLPreElement;
  deviceInfo?: DeviceInfoElements;
}

export interface ConnectionController {
  transport: WebBluetoothTransport;
  log: (message: string) => void;
  setConnectedState: (connected: boolean, deviceName?: string) => void;
  formatError: (error: unknown) => string;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export function formatTransportError(error: unknown): string {
  if (error instanceof PrinterTransportError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export interface ConnectionOptions {
  transport: WebBluetoothTransport;
  elements: ConnectionElements;
  dependentButtons?: HTMLButtonElement[];
  onConnectionChange?: (connected: boolean) => void;
}

interface NativeConnectionState {
  connected: boolean;
  deviceId?: string;
  name?: string;
}

function getNativeConnectionState(): (() => Promise<NativeConnectionState>) | undefined {
  const bluetooth = navigator.bluetooth as
    | (Bluetooth & {
        getConnectionState?: () => Promise<NativeConnectionState>;
      })
    | undefined;
  return bluetooth?.getConnectionState;
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function updateDeviceInfo(
  transport: WebBluetoothTransport,
  deviceInfo: DeviceInfoElements | undefined,
  connected: boolean,
): void {
  if (!deviceInfo) {
    return;
  }

  const deviceId = transport.deviceId;
  if (!connected || !deviceId) {
    deviceInfo.container.hidden = true;
    deviceInfo.copyButton.disabled = true;
    return;
  }

  const address = normalizeBleAddress(deviceId);
  const macAddress = isMacAddress(address);

  deviceInfo.container.hidden = false;
  deviceInfo.labelText.textContent = macAddress ? "BLE address" : "Device ID";
  deviceInfo.addressText.textContent = address;
  deviceInfo.hintText.textContent = macAddress
    ? "Copy and set as PRINTER_ADDRESS when starting the print server."
    : "Web Bluetooth hides the MAC on this platform. Find it in System Settings → Bluetooth, or run the server without PRINTER_ADDRESS to scan.";
  deviceInfo.copyButton.disabled = false;
  deviceInfo.copyButton.onclick = () => {
    const value = macAddress ? `PRINTER_ADDRESS=${address}` : address;
    void copyText(value)
      .then(() => {
        const originalLabel = deviceInfo.copyButton.textContent;
        deviceInfo.copyButton.textContent = "Copied!";
        window.setTimeout(() => {
          deviceInfo.copyButton.textContent = originalLabel;
        }, 1500);
      })
      .catch(() => undefined);
  };
}

export function createConnectionController(
  options: ConnectionOptions,
): ConnectionController {
  const { transport, elements, dependentButtons = [], onConnectionChange } =
    options;
  const { connectButton, disconnectButton, connectionStatus, logElement, deviceInfo } =
    elements;

  function log(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    logElement.textContent = `${logElement.textContent ?? ""}[${timestamp}] ${message}\n`;
    logElement.scrollTop = logElement.scrollHeight;
  }

  function setConnectedState(connected: boolean, deviceName?: string): void {
    connectButton.disabled = connected;
    disconnectButton.disabled = !connected;

    for (const button of dependentButtons) {
      button.disabled = !connected;
    }

    connectionStatus.textContent = connected
      ? `Connected to ${deviceName ?? "printer"}`
      : "Not connected";

    updateDeviceInfo(transport, deviceInfo, connected);
    onConnectionChange?.(connected);
  }

  async function connect(): Promise<void> {
    try {
      const getConnectionState = getNativeConnectionState();
      const existing =
        getConnectionState === undefined
          ? undefined
          : await getConnectionState();

      if (existing?.connected) {
        log("Restoring printer connection...");
      } else {
        log("Opening Bluetooth device picker...");
      }

      await transport.connect();
      setConnectedState(true, transport.deviceName);
      const deviceId = transport.deviceId;
      if (deviceId && isMacAddress(normalizeBleAddress(deviceId))) {
        log(
          `Connected to ${transport.deviceName ?? "printer"} (${normalizeBleAddress(deviceId)}).`,
        );
      } else {
        log(`Connected to ${transport.deviceName ?? "printer"}.`);
      }
    } catch (error) {
      setConnectedState(false);
      log(`Connect failed: ${formatTransportError(error)}`);
    }
  }

  async function disconnect(): Promise<void> {
    try {
      await transport.disconnect();
      setConnectedState(false);
      log("Disconnected.");
    } catch (error) {
      log(`Disconnect failed: ${formatTransportError(error)}`);
    }
  }

  return {
    transport,
    log,
    setConnectedState,
    formatError: formatTransportError,
    connect,
    disconnect,
  };
}

export function initializeBluetoothUi(
  controller: ConnectionController,
  options: {
    connectButton: HTMLButtonElement;
    disconnectButton: HTMLButtonElement;
    dependentButtons?: HTMLButtonElement[];
    connectionStatus: HTMLParagraphElement;
    readyMessage?: string;
  },
): void {
  const {
    connectButton,
    disconnectButton,
    dependentButtons = [],
    connectionStatus,
    readyMessage = "Ready. Turn on the printer and click Connect.",
  } = options;

  if (!navigator.bluetooth) {
    connectButton.disabled = true;
    disconnectButton.disabled = true;
    for (const button of dependentButtons) {
      button.disabled = true;
    }
    connectionStatus.textContent =
      "Web Bluetooth is not available in this browser.";
    controller.log("Use Chrome or Edge on desktop or Android.");
    return;
  }

  controller.setConnectedState(false);

  connectButton.addEventListener("click", () => {
    void controller.connect();
  });
  disconnectButton.addEventListener("click", () => {
    void controller.disconnect();
  });

  controller.log(readyMessage);

  const getConnectionState = getNativeConnectionState();
  if (getConnectionState) {
    void getConnectionState()
      .then((state) => {
        if (state.connected) {
          return controller.connect();
        }
        return undefined;
      })
      .catch(() => undefined);
  }
}
