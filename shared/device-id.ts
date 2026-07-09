const MAC_ADDRESS_PATTERN = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;

/** Strip dashes/colons and lowercase for stable comparisons. */
export function normalizeDeviceIdentifier(value: string): string {
  return value.toLowerCase().replace(/[-:]/g, "");
}

export function formatCoreBluetoothId(id: string): string {
  const hex = normalizeDeviceIdentifier(id);
  if (hex.length !== 32) {
    return id;
  }

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isMacAddress(value: string): boolean {
  return MAC_ADDRESS_PATTERN.test(value);
}

export function isCoreBluetoothId(value: string): boolean {
  const hex = normalizeDeviceIdentifier(value);
  return hex.length === 32 && /^[0-9a-f]+$/.test(hex);
}

/** Value to pass as PRINTER_ADDRESS (MAC when known, else Core Bluetooth id). */
export function deviceConnectId(address: string, id: string): string {
  const trimmedAddress = address.trim();
  if (trimmedAddress) {
    return trimmedAddress;
  }

  return formatCoreBluetoothId(id);
}

export function deviceIdentifiersMatch(a: string, b: string): boolean {
  return normalizeDeviceIdentifier(a) === normalizeDeviceIdentifier(b);
}
