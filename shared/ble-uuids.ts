export const ISSC_SERVICE_UUID = "49535343-fe7d-4ae5-8fa9-9fafd205e455";
export const ISSC_TX_CHARACTERISTIC_UUID =
  "49535343-8841-43f4-a8d4-ecbe34729bb3";
export const ISSC_RX_CHARACTERISTIC_UUID =
  "49535343-1e4d-4bd9-ba61-23c647249616";

/** Compare UUIDs regardless of dash/case formatting. */
export function normalizeBleUuid(uuid: string): string {
  return uuid.replace(/-/g, "").toLowerCase();
}

export function uuidMatches(a: string, b: string): boolean {
  return normalizeBleUuid(a) === normalizeBleUuid(b);
}
