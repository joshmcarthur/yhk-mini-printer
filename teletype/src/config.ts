export interface TeletypeConfig {
  mqttUrl: string;
  mqttUsername?: string;
  mqttPassword?: string;
  mqttTopic: string;
  mqttClientId: string;
  printServerUrl: string;
  dryRun: boolean;
  logLevel: "info" | "debug";
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function parseLogLevel(value: string | undefined): "info" | "debug" {
  if (value === "debug") {
    return "debug";
  }
  return "info";
}

export function loadConfig(): TeletypeConfig {
  const mqttUsername = process.env.MQTT_USERNAME?.trim();
  const mqttPassword = process.env.MQTT_PASSWORD?.trim();

  return {
    mqttUrl: requireEnv("MQTT_URL"),
    mqttUsername: mqttUsername || undefined,
    mqttPassword: mqttPassword || undefined,
    mqttTopic: process.env.MQTT_TOPIC?.trim() || "msh/+/+/json/#",
    mqttClientId: process.env.MQTT_CLIENT_ID?.trim() || "yhk-teletype",
    printServerUrl:
      process.env.PRINT_SERVER_URL?.replace(/\/$/, "") ?? "http://localhost:8787",
    dryRun: process.env.TELETYPE_DRY_RUN === "1",
    logLevel: parseLogLevel(process.env.TELETYPE_LOG_LEVEL),
  };
}
