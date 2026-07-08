# YHK Mini Printer

Browser-based control for YHK-series mini thermal printers (e.g. YHK-962D). Connect over Web Bluetooth from Chrome, print a test image using ESC/POS raster commands.

**Status:** Phase 1 proof of concept — protocol validated from the browser. Long-term target is a [Pi print server](docs/architecture.md) for iOS, remote printing, and webhooks.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in **Chrome or Edge**.

1. Power on the printer (disconnect from phone apps first).
2. Click **Connect** → select `YHK-...` in the picker.
3. Click **Print Test Image**.

## Requirements

| | |
|---|---|
| **Browser** | Chrome or Edge (desktop/Android). Not Safari/iOS. |
| **Host** | `localhost` or HTTPS |
| **Printer** | YHK-* BLE thermal, ISSC UART profile |

## Documentation

| Doc | Contents |
|-----|----------|
| [Architecture](docs/architecture.md) | Phased roadmap, `PrinterTransport`, Pi server plan |
| [Protocol](docs/protocol.md) | BLE UUIDs, ESC/POS, chunk pacing, tuning |
| [Exploration notes](docs/exploration/chatgpt.md) | Early research and UUID discovery |

## Project layout

```
src/
├── main.ts                    # UI
├── transport.ts               # PrinterTransport + paced sendChunked()
├── transport/web-bluetooth.ts # Web Bluetooth (Phase 1)
├── escpos.ts                  # ESC/POS encoding
└── image.ts                   # Test pattern + thresholding
```

## Build

```bash
npm run build    # typecheck + dist/
npm run preview  # serve production build
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Bottom of image missing | Increase `BLE_CHUNK_DELAY_MS` in `src/transport.ts` (try 50–60) |
| Service not found | Wrong UUIDs — see [protocol.md](docs/protocol.md#uuid-discovery) |
| Upside-down output | Rotate image 180° before encoding |
| Web Bluetooth unavailable | Use Chrome/Edge on localhost or HTTPS |

## Roadmap

- [x] **Phase 1** — Web Bluetooth PoC, test image print
- [ ] **Phase 2** — Pi print server, native BLE
- [ ] **Phase 3** — HTTP client transport (iOS, remote)
- [ ] **Phase 4** — Webhooks, queue, auth

## License

MIT
