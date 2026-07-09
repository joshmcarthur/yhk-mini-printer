import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  MAX_BLOCKS,
  MAX_TEXT_CHARS,
  normalizePrintRequest,
  type NormalizedPrintRequest,
} from "@yhk/shared/print-document";

const PRINT_SERVER_URL =
  process.env.PRINT_SERVER_URL?.replace(/\/$/, "") ?? "http://localhost:8787";

const PrintBlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("title"),
    text: z.string().max(MAX_TEXT_CHARS),
  }),
  z.object({
    type: z.literal("text"),
    text: z.string().max(MAX_TEXT_CHARS),
    font: z.enum(["normal", "mono"]).optional(),
    maxLines: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal("qr"),
    data: z.string().min(1).max(2_000),
    size: z.number().int().min(120).max(300).optional(),
    ecc: z.enum(["M", "Q", "H"]).optional(),
  }),
  z.object({
    type: z.literal("image"),
    url: z.string().url().optional(),
    base64: z.string().optional(),
    dither: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("spacer"),
    px: z.number().int().min(0).max(120),
  }),
]);

const PrintToolSchema = z.union([
  z.object({
    blocks: z.array(PrintBlockSchema).min(1).max(MAX_BLOCKS),
  }),
  z.object({
    title: z.string().max(MAX_TEXT_CHARS).optional(),
    lines: z.array(z.string().max(MAX_TEXT_CHARS)).min(1).max(25),
    qr: z.string().max(2_000).optional(),
    footer: z.string().max(MAX_TEXT_CHARS).optional(),
    images: z.array(z.string()).max(3).optional(),
  }),
]);

interface HealthResponse {
  status: string;
  printer_connected: boolean;
  printer_name: string | null;
  printer_address: string | null;
}

interface PrintResponse {
  success: boolean;
  bytes_sent?: number;
  height_px?: number;
  error?: string;
}

async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${PRINT_SERVER_URL}/health`);
  if (!response.ok) {
    throw new Error(`Health check failed (${response.status}).`);
  }

  return response.json() as Promise<HealthResponse>;
}

async function postPrint(body: NormalizedPrintRequest): Promise<PrintResponse> {
  const response = await fetch(`${PRINT_SERVER_URL}/print`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as PrintResponse;
  if (!response.ok) {
    throw new Error(payload.error ?? `Print failed (${response.status}).`);
  }

  return payload;
}

const server = new McpServer({
  name: "yhk-printer",
  version: "0.1.0",
});

server.registerTool(
  "printer_status",
  {
    description:
      "Check whether the local YHK print daemon is running and the BLE printer is connected.",
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const health = await fetchHealth();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                print_server_url: PRINT_SERVER_URL,
                status: health.status,
                printer_connected: health.printer_connected,
                printer_name: health.printer_name,
                printer_address: health.printer_address,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to reach print server.";
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                print_server_url: PRINT_SERVER_URL,
                success: false,
                error: message,
              },
              null,
              2,
            ),
          },
        ],
      };
    }
  },
);

server.registerTool(
  "print",
  {
    description:
      "Print a monochrome document on a 58mm thermal printer (384px wide). " +
      "Pass an ordered blocks[] array for full layout control, or use shorthand fields " +
      "(title, lines, qr, footer, images). Keep jobs reasonably short (about 25 lines). " +
      "Use qr blocks for scannable URLs and image blocks for diagrams, maps, or screenshots.",
    inputSchema: PrintToolSchema,
  },
  async (args) => {
    try {
      const parsed = PrintToolSchema.parse(args);
      const blocks = normalizePrintRequest(parsed);
      const result = await postPrint(parsed);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                blocks: blocks.length,
                bytes_sent: result.bytes_sent,
                height_px: result.height_px,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to print document.";
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: false,
                error: message,
              },
              null,
              2,
            ),
          },
        ],
      };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
