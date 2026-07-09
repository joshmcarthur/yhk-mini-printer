import type { Context } from "hono";
import {
  normalizePrintRequest,
  validatePrintBlocks,
  type NormalizedPrintRequest,
} from "@yhk/shared/print-document";
import { composeToJob } from "../composer/compose.js";
import type { AsyncMutex } from "../print-mutex.js";
import type { NativeBleTransport } from "../transport/native-ble.js";

export function createPrintRoute(options: {
  getTransport: () => NativeBleTransport | null;
  mutex: AsyncMutex;
}) {
  return async (context: Context) => {
    const transport = options.getTransport();
    if (!transport?.connected) {
      return context.json(
        {
          success: false,
          error: "Printer is not connected.",
        },
        503,
      );
    }

    let body: NormalizedPrintRequest;
    try {
      body = await context.req.json<NormalizedPrintRequest>();
    } catch {
      return context.json(
        {
          success: false,
          error: "Request body must be valid JSON.",
        },
        400,
      );
    }

    const blocks = normalizePrintRequest(body);
    const validationError = validatePrintBlocks(blocks);
    if (validationError) {
      return context.json(
        {
          success: false,
          error: validationError,
        },
        400,
      );
    }

    try {
      const result = await options.mutex.runExclusive(async () => {
        const composed = await composeToJob(blocks);
        await transport.send(composed.job);
        return composed;
      });

      return context.json({
        success: true,
        bytes_sent: result.job.byteLength,
        height_px: result.height,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to print document.";
      return context.json(
        {
          success: false,
          error: message,
        },
        500,
      );
    }
  };
}

export function createRawPrintRoute(options: {
  getTransport: () => NativeBleTransport | null;
  mutex: AsyncMutex;
}) {
  return async (context: Context) => {
    const transport = options.getTransport();
    if (!transport?.connected) {
      return context.json(
        {
          success: false,
          error: "Printer is not connected.",
        },
        503,
      );
    }

    const body = await context.req.arrayBuffer();
    if (body.byteLength === 0) {
      return context.json(
        {
          success: false,
          error: "Raw print body must not be empty.",
        },
        400,
      );
    }

    try {
      const bytes = new Uint8Array(body);
      await options.mutex.runExclusive(async () => {
        await transport.send(bytes);
      });

      return context.json({
        success: true,
        bytes_sent: bytes.byteLength,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to send raw print job.";
      return context.json(
        {
          success: false,
          error: message,
        },
        500,
      );
    }
  };
}
