export type WifiEncryption = "WPA" | "WEP" | "nopass";

export function wifiQr(
  ssid: string,
  password: string,
  encryption: WifiEncryption = "WPA",
): string {
  const type = encryption === "nopass" ? "nopass" : encryption;
  const passwordSegment =
    encryption === "nopass" ? "" : `;P:${escapeWifiField(password)}`;
  return `WIFI:T:${type};S:${escapeWifiField(ssid)}${passwordSegment};;`;
}

export function urlQr(url: string): string {
  return url;
}

export function textQr(text: string): string {
  return text;
}

function escapeWifiField(value: string): string {
  return value.replace(/([\\;,:"])/g, "\\$1");
}
