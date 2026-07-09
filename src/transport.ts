export {
  BLE_CHUNK_DELAY_MS,
  BLE_CHUNK_SIZE,
  BLE_FLUSH_DELAY_MS,
} from "@shared/constants.ts";
export {
  sendChunked,
  type SendChunkedOptions,
} from "@shared/send-chunked.ts";

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
      | "user-cancelled"
      | "characteristic-not-found"
      | "not-connected",
  ) {
    super(message);
    this.name = "PrinterTransportError";
  }
}
