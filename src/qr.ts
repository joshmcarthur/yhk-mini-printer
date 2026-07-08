import { buildPrintJob } from "@shared/escpos.ts";
import { buildQrBlocks, compose } from "./composer/compose.ts";
import { textQr, urlQr, wifiQr } from "./composer/presets.ts";
import { drawPreview } from "./image.ts";
import {
  createConnectionController,
  initializeBluetoothUi,
} from "./ui/connection.ts";
import { WebBluetoothTransport } from "./transport/web-bluetooth.ts";

type PayloadType = "url" | "text" | "wifi";

interface QrFormState {
  payloadType: PayloadType;
  url: string;
  text: string;
  wifiSsid: string;
  wifiPassword: string;
  caption: string;
  qrSize: number;
  fontSize: number;
}

const STORAGE_KEY = "yhk-qr-composer-state";

function getRequiredElement<T extends Element>(selector: string): T {
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

const payloadTypeInputs = Array.from(
  document.querySelectorAll<HTMLInputElement>('input[name="payload-type"]'),
);
const urlField = getRequiredElement<HTMLDivElement>("#url-field");
const textField = getRequiredElement<HTMLDivElement>("#text-field");
const wifiField = getRequiredElement<HTMLDivElement>("#wifi-field");
const urlInput = getRequiredElement<HTMLInputElement>("#url-input");
const textInput = getRequiredElement<HTMLTextAreaElement>("#text-input");
const wifiSsidInput = getRequiredElement<HTMLInputElement>("#wifi-ssid");
const wifiPasswordInput =
  getRequiredElement<HTMLInputElement>("#wifi-password");
const captionInput = getRequiredElement<HTMLInputElement>("#caption-input");
const qrSizeInput = getRequiredElement<HTMLInputElement>("#qr-size-input");
const qrSizeValue = getRequiredElement<HTMLSpanElement>("#qr-size-value");
const fontSizeInput = getRequiredElement<HTMLInputElement>("#font-size-input");
const fontSizeValue = getRequiredElement<HTMLSpanElement>("#font-size-value");

const transport = new WebBluetoothTransport();
const connection = createConnectionController({
  transport,
  elements: {
    connectButton,
    disconnectButton,
    connectionStatus,
    logElement,
  },
  dependentButtons: [printButton],
});

function readPayloadType(): PayloadType {
  const selected = payloadTypeInputs.find((input) => input.checked);
  if (selected?.value === "text" || selected?.value === "wifi") {
    return selected.value;
  }

  return "url";
}

function readFormState(): QrFormState {
  return {
    payloadType: readPayloadType(),
    url: urlInput.value.trim(),
    text: textInput.value.trim(),
    wifiSsid: wifiSsidInput.value.trim(),
    wifiPassword: wifiPasswordInput.value,
    caption: captionInput.value,
    qrSize: Number(qrSizeInput.value),
    fontSize: Number(fontSizeInput.value),
  };
}

function saveFormState(state: QrFormState): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadFormState(): QrFormState | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<QrFormState>;
    return {
      payloadType: parsed.payloadType ?? "url",
      url: parsed.url ?? "",
      text: parsed.text ?? "",
      wifiSsid: parsed.wifiSsid ?? "",
      wifiPassword: parsed.wifiPassword ?? "",
      caption: parsed.caption ?? "",
      qrSize: parsed.qrSize ?? 240,
      fontSize: parsed.fontSize ?? 14,
    };
  } catch {
    return null;
  }
}

function applyFormState(state: QrFormState): void {
  for (const input of payloadTypeInputs) {
    input.checked = input.value === state.payloadType;
  }

  urlInput.value = state.url;
  textInput.value = state.text;
  wifiSsidInput.value = state.wifiSsid;
  wifiPasswordInput.value = state.wifiPassword;
  captionInput.value = state.caption;
  qrSizeInput.value = String(state.qrSize);
  qrSizeValue.textContent = String(state.qrSize);
  fontSizeInput.value = String(state.fontSize);
  fontSizeValue.textContent = String(state.fontSize);
  updatePayloadFields();
}

function updatePayloadFields(): void {
  const payloadType = readPayloadType();
  urlField.hidden = payloadType !== "url";
  textField.hidden = payloadType !== "text";
  wifiField.hidden = payloadType !== "wifi";
}

function buildPayload(state: QrFormState): string {
  switch (state.payloadType) {
    case "url":
      return urlQr(state.url);
    case "text":
      return textQr(state.text);
    case "wifi":
      return wifiQr(
        state.wifiSsid,
        state.wifiPassword,
        state.wifiPassword ? "WPA" : "nopass",
      );
    default: {
      const unreachable: never = state.payloadType;
      throw new Error(`Unsupported payload type: ${String(unreachable)}`);
    }
  }
}

function validateForm(state: QrFormState): string | null {
  switch (state.payloadType) {
    case "url":
      if (!state.url) {
        return "Enter a URL to encode.";
      }
      return null;
    case "text":
      if (!state.text) {
        return "Enter text to encode.";
      }
      return null;
    case "wifi":
      if (!state.wifiSsid) {
        return "Enter a Wi-Fi network name.";
      }
      return null;
    default: {
      const unreachable: never = state.payloadType;
      return `Unsupported payload type: ${String(unreachable)}`;
    }
  }
}

async function refreshPreview(): Promise<void> {
  const state = readFormState();
  saveFormState(state);

  const validationError = validateForm(state);
  if (validationError) {
    connection.log(validationError);
    return;
  }

  try {
    const payload = buildPayload(state);
    const blocks = buildQrBlocks({
      payload,
      caption: state.caption,
      qrSize: state.qrSize,
    });
    const result = await compose(blocks, { fontSize: state.fontSize });
    drawPreview(previewCanvas, result.canvas);
  } catch (error) {
    connection.log(`Preview failed: ${connection.formatError(error)}`);
  }
}

async function handlePrint(): Promise<void> {
  const state = readFormState();
  saveFormState(state);

  const validationError = validateForm(state);
  if (validationError) {
    connection.log(validationError);
    return;
  }

  try {
    const payload = buildPayload(state);
    const blocks = buildQrBlocks({
      payload,
      caption: state.caption,
      qrSize: state.qrSize,
    });
    const result = await compose(blocks, { fontSize: state.fontSize });
    drawPreview(previewCanvas, result.canvas);

    const job = buildPrintJob(result.pixels);
    connection.log(`Sending ${job.length} bytes with paced BLE writes...`);
    await transport.send(job);
    connection.log("Print job sent. Waiting for printer to finish.");
  } catch (error) {
    connection.log(`Print failed: ${connection.formatError(error)}`);
  }
}

function initialize(): void {
  const saved = loadFormState();
  if (saved) {
    applyFormState(saved);
  } else {
    qrSizeValue.textContent = qrSizeInput.value;
    fontSizeValue.textContent = fontSizeInput.value;
    updatePayloadFields();
  }

  for (const input of payloadTypeInputs) {
    input.addEventListener("change", () => {
      updatePayloadFields();
      void refreshPreview();
    });
  }

  const formInputs = [
    urlInput,
    textInput,
    wifiSsidInput,
    wifiPasswordInput,
    captionInput,
  ];

  for (const input of formInputs) {
    input.addEventListener("input", () => {
      void refreshPreview();
    });
  }

  qrSizeInput.addEventListener("input", () => {
    qrSizeValue.textContent = qrSizeInput.value;
    void refreshPreview();
  });

  fontSizeInput.addEventListener("input", () => {
    fontSizeValue.textContent = fontSizeInput.value;
    void refreshPreview();
  });

  printButton.addEventListener("click", () => {
    void handlePrint();
  });

  initializeBluetoothUi(connection, {
    connectButton,
    disconnectButton,
    dependentButtons: [printButton],
    connectionStatus,
    readyMessage: "Ready. Compose a QR code and click Print.",
  });

  void refreshPreview();
}

initialize();
