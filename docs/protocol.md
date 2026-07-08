# Printer protocol

## Hardware

This project targets **cheap BLE pocket thermal printers** that accept ESC/POS raster over an ISSC Transparent UART GATT service. The primary tested device is the [Kmart Thermal Bluetooth Printer](https://www.kmart.co.nz/product/thermal-bluetooth-printer-43437771/) (SKU 43437771), which advertises as `YHK-*` and matches the YHK-962D class.

- **Transport:** Bluetooth Low Energy, ISSC Transparent UART service
- **Print language:** ESC/POS raster (`GS v 0`)
- **Head width:** 384 dots (48 bytes per row) — standard 58mm thermal

See [README — Supported devices](../README.md#supported-devices) for the full compatibility table.

## BLE GATT profile

ISSC (Microchip) UART service:

| Role | UUID |
|------|------|
| Service | `49535343-fe7d-4ae5-8fa9-9fafd205e455` |
| TX — host → printer (write) | `49535343-8841-43f4-a8d4-ecbe34729bb3` |
| RX — printer → host (notify) | `49535343-1e4d-4bd9-ba61-23c647249616` |

Connection flow:

1. `navigator.bluetooth.requestDevice()` with `namePrefix: "YHK"` and `optionalServices` including the service UUID.
2. `gatt.connect()` → `getPrimaryService()` → `getCharacteristic(TX)`.
3. Optionally `startNotifications()` on RX (some printers benefit; not strictly required).

Constants live in [`src/transport/web-bluetooth.ts`](../src/transport/web-bluetooth.ts).

### UUID discovery

If connection fails with "service not found", dump characteristics in Chrome — see [exploration/chatgpt.md](./exploration/chatgpt.md).

## ESC/POS commands

| Command | Bytes | Purpose |
|---------|-------|---------|
| Init | `1B 40` | Reset printer (`ESC @`) |
| Raster | `1D 76 30 00` + width + height + bitmap | `GS v 0` — print 1-bit image |
| Feed lines | `1B 64 n` | `ESC d n` — advance paper |
| Line feed | `0A` | Advance one line |

### Raster header (`GS v 0`)

```
1D 76 30 00
xL xH          # width in bytes, little-endian
yL yH          # height in dots, little-endian
[data...]      # x × y bytes, MSB-first, 1 = black dot
```

Bitmap packing (per row, MSB = leftmost pixel):

```typescript
if (pixelIsBlack) {
  bitmap[y * widthBytes + (x >> 3)] |= 1 << (7 - (x & 7));
}
```

Implementation: [`src/escpos.ts`](../src/escpos.ts).

## BLE transmission

`writeValueWithoutResponse` has no per-chunk acknowledgement. The printer's internal buffer is only a few KB — sending faster than the print head consumes data causes **silent data loss**, typically truncating the bottom of the image.

Defaults in [`src/transport.ts`](../src/transport.ts):

| Constant | Value | Notes |
|----------|-------|-------|
| `BLE_CHUNK_SIZE` | 182 bytes | Fits typical BLE MTU |
| `BLE_CHUNK_DELAY_MS` | 40 ms | ~5 KB/s — matches ISSC printer sweet spot |
| `BLE_FLUSH_DELAY_MS` | 1500 ms | Wait for print head after last chunk |

Tuning:

- **Truncated bottom** → increase `BLE_CHUNK_DELAY_MS` (try 50–60 ms).
- **White horizontal bands** → decrease delay (data arriving slower than head speed).

Reference: similar ISSC UART printers (YMP-01) documented at [lilting.ch](https://lilting.ch/en/articles/mini-printer-sugar-bluetooth-pc-control).

## Image preparation

1. Render to canvas at **384 px** width.
2. Threshold grayscale at 128 → boolean `[][]` (black = `true`).
3. Pass to `buildPrintJob()`.

Some printers output upside-down (paper path). If orientation is wrong, rotate the canvas 180° before encoding.

## Exploration notes

Early research and ChatGPT exploration notes: [exploration/chatgpt.md](./exploration/chatgpt.md).
