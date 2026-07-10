#!/usr/bin/env node

import mqtt from "mqtt";
import { loadConfig } from "./config.js";
import { DedupeWindow } from "./dedupe.js";
import { shouldPrint } from "./filter.js";
import { formatTeletypeSlip } from "./format.js";
import { dedupeKey, parseMeshtasticJson } from "./meshtastic.js";
import { postPrint } from "./print-client.js";

function log(level: "info" | "debug", message: string): void {
  console.log(`[teletype] ${level}: ${message}`);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const dedupe = new DedupeWindow();
  const printOptions = {
    printServerUrl: config.printServerUrl,
    dryRun: config.dryRun,
  };

  let processing = Promise.resolve();

  const client = mqtt.connect(config.mqttUrl, {
    clientId: config.mqttClientId,
    username: config.mqttUsername,
    password: config.mqttPassword,
    reconnectPeriod: 5_000,
  });

  client.on("connect", () => {
    log("info", `connected to ${config.mqttUrl}`);
    client.subscribe(config.mqttTopic, (error) => {
      if (error) {
        log("info", `subscribe failed: ${error.message}`);
        return;
      }
      log("info", `subscribed to ${config.mqttTopic}`);
    });
  });

  client.on("reconnect", () => {
    log("info", "reconnecting…");
  });

  client.on("close", () => {
    log("info", "disconnected");
  });

  client.on("error", (error) => {
    log("info", `mqtt error: ${error.message}`);
  });

  client.on("message", (_topic, payload) => {
    processing = processing
      .then(async () => {
        const raw = payload.toString("utf8");
        const msg = parseMeshtasticJson(raw);
        if (!msg) {
          if (config.logLevel === "debug") {
            log("debug", "skipped: invalid JSON");
          }
          return;
        }

        const decision = shouldPrint(msg);
        if (!decision) {
          if (config.logLevel === "debug") {
            log("debug", `skipped: ${msg.type} (filter)`);
          }
          return;
        }

        const key = dedupeKey(msg, decision.body);
        if (dedupe.has(key)) {
          if (config.logLevel === "debug") {
            log("debug", `skipped: duplicate ${key}`);
          }
          return;
        }

        dedupe.add(key);

        const blocks = formatTeletypeSlip(msg, decision.kind, decision.body);
        try {
          const result = await postPrint(blocks, printOptions);
          log(
            "info",
            `printed ${decision.kind} from ${msg.sender ?? msg.from} (${result.bytes_sent ?? 0} bytes)`,
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown print error";
          log("info", `print failed: ${message}`);
        }
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : "Unknown handler error";
        log("info", `handler error: ${message}`);
      });
  });

  const shutdown = (): void => {
    log("info", "shutting down");
    client.end(true);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

await main();
