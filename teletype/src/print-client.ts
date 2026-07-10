import { validatePrintBlocks, type PrintBlock } from "@yhk/shared/print-document";

export interface PrintResult {
  success: boolean;
  bytes_sent?: number;
  height_px?: number;
  error?: string;
}

export interface PrintClientOptions {
  printServerUrl: string;
  dryRun: boolean;
}

export async function postPrint(
  blocks: PrintBlock[],
  options: PrintClientOptions,
): Promise<PrintResult> {
  const validationError = validatePrintBlocks(blocks);
  if (validationError) {
    throw new Error(validationError);
  }

  if (options.dryRun) {
    console.log("[teletype] dry-run print:", JSON.stringify({ blocks }, null, 2));
    return { success: true, bytes_sent: 0, height_px: 0 };
  }

  const response = await fetch(`${options.printServerUrl}/print`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ blocks }),
  });

  const payload = (await response.json()) as PrintResult;
  if (!response.ok) {
    throw new Error(payload.error ?? `Print failed (${response.status}).`);
  }

  return payload;
}
