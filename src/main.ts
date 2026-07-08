import { buildPrintJob } from "./escpos.ts";
import { drawPreview, generateTestPattern } from "./image.ts";
import { PrinterTransportError } from "./transport.ts";
import { WebBluetoothTransport } from "./transport/web-bluetooth.ts";

const PRINTER_WIDTH = 384;

function getRequiredElement<T extends Element>(
  selector: string,
): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Required UI element not found: ${selector}`);
  }

  return element;
}

const connectButton = getRequiredElement<HTMLButtonElement>("#connect-btn");
const printButton = getRequiredElement<HTMLButtonElement>("#print-btn");
const disconnectButton =
  getRequiredElement<HTMLButtonElement>("#disconnect-btn");
const connectionStatus =
  getRequiredElement<HTMLParagraphElement>("#connection-status");
const previewCanvas = getRequiredElement<HTMLCanvasElement>("#preview");
const logElement = getRequiredElement<HTMLPreElement>("#log");

const transport = new WebBluetoothTransport();
let latestPattern = generateTestPattern(PRINTER_WIDTH);

function log(message: string): void {
  const timestamp = new Date().toLocaleTimeString();
  logElement.textContent = `${logElement.textContent ?? ""}[${timestamp}] ${message}\n`;
  logElement.scrollTop = logElement.scrollHeight;
}

function updatePreview(): void {
  drawPreview(previewCanvas, latestPattern.canvas);
}

function setConnectedState(connected: boolean, deviceName?: string): void {
  connectButton.disabled = connected;
  printButton.disabled = !connected;
  disconnectButton.disabled = !connected;
  connectionStatus.textContent = connected
    ? `Connected to ${deviceName ?? "printer"}`
    : "Not connected";
}

function formatError(error: unknown): string {
  if (error instanceof PrinterTransportError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function refreshTestPattern(): void {
  latestPattern = generateTestPattern(PRINTER_WIDTH);
  updatePreview();
}

async function handleConnect(): Promise<void> {
  try {
    log("Opening Bluetooth device picker...");
    await transport.connect();
    setConnectedState(true, transport.deviceName);
    log(`Connected to ${transport.deviceName ?? "printer"}.`);
  } catch (error) {
    setConnectedState(false);
    log(`Connect failed: ${formatError(error)}`);
  }
}

async function handlePrint(): Promise<void> {
  try {
    refreshTestPattern();
    const job = buildPrintJob(latestPattern.pixels);
    log(`Sending ${job.length} bytes with paced BLE writes...`);
    await transport.send(job);
    log("Print job sent. Waiting for printer to finish.");
  } catch (error) {
    log(`Print failed: ${formatError(error)}`);
  }
}

async function handleDisconnect(): Promise<void> {
  try {
    await transport.disconnect();
    setConnectedState(false);
    log("Disconnected.");
  } catch (error) {
    log(`Disconnect failed: ${formatError(error)}`);
  }
}

function initialize(): void {
  if (!navigator.bluetooth) {
    connectButton.disabled = true;
    printButton.disabled = true;
    disconnectButton.disabled = true;
    connectionStatus.textContent =
      "Web Bluetooth is not available in this browser.";
    log("Use Chrome or Edge on desktop or Android.");
    updatePreview();
    return;
  }

  refreshTestPattern();
  setConnectedState(false);

  connectButton.addEventListener("click", () => {
    void handleConnect();
  });
  printButton.addEventListener("click", () => {
    void handlePrint();
  });
  disconnectButton.addEventListener("click", () => {
    void handleDisconnect();
  });

  log("Ready. Turn on the printer and click Connect.");
}

initialize();
