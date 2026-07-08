import { PrinterTransportError } from "../transport.ts";
import type { WebBluetoothTransport } from "../transport/web-bluetooth.ts";

export interface ConnectionElements {
  connectButton: HTMLButtonElement;
  disconnectButton: HTMLButtonElement;
  connectionStatus: HTMLParagraphElement;
  logElement: HTMLPreElement;
}

export interface ConnectionController {
  transport: WebBluetoothTransport;
  log: (message: string) => void;
  setConnectedState: (connected: boolean, deviceName?: string) => void;
  formatError: (error: unknown) => string;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export interface ConnectionOptions {
  transport: WebBluetoothTransport;
  elements: ConnectionElements;
  dependentButtons?: HTMLButtonElement[];
  onConnectionChange?: (connected: boolean) => void;
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

export function createConnectionController(
  options: ConnectionOptions,
): ConnectionController {
  const { transport, elements, dependentButtons = [], onConnectionChange } =
    options;
  const { connectButton, disconnectButton, connectionStatus, logElement } =
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

    onConnectionChange?.(connected);
  }

  async function connect(): Promise<void> {
    try {
      log("Opening Bluetooth device picker...");
      await transport.connect();
      setConnectedState(true, transport.deviceName);
      log(`Connected to ${transport.deviceName ?? "printer"}.`);
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
}
