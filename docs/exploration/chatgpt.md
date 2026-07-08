Yes — this is actually a very good fit for Web Bluetooth. The printer is behaving like a simple BLE GATT peripheral with a writable characteristic, so you don’t need native code.

The architecture would look like:

Browser
|
| Web Bluetooth
|
BLE GATT
|
| writeWithoutResponse / writeValue
|
YHK-962D printer
|
ESC/POS parser
|
Thermal head

The main things we need to know are:

1. The service UUID
2. The write characteristic UUID
3. Whether notifications are needed
4. Whether the browser allows the required BLE operations

From your capture:

- Write characteristic handle: 0x0004
- Notification characteristic handle: 0x0006

We need the UUIDs behind those handles. They are probably a standard UART-like service, but Web Bluetooth requires UUIDs.

You can get them in Chrome by doing:

const device = await navigator.bluetooth.requestDevice({
filters: [
{ namePrefix: "YHK" }
],
acceptAllDevices: true,
optionalServices: [
"device_information"
]
});

then:

const server = await device.gatt.connect();
const services = await server.getPrimaryServices();
for (const service of services) {
console.log("service", service.uuid);
const chars = await service.getCharacteristics();
for (const c of chars) {
console.log(
" ",
c.uuid,
"write",
c.properties.write,
"writeNoResp",
c.properties.writeWithoutResponse,
"notify",
c.properties.notify
);
}
}

That will reveal the UUIDs.

⸻

Once we have those, the printer code is basically:

async function connectPrinter() {
const device = await navigator.bluetooth.requestDevice({
filters: [{ namePrefix: "YHK" }],
optionalServices: [
"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
]
});
const server = await device.gatt!.connect();
const service = await server.getPrimaryService(
"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
);
const tx = await service.getCharacteristic(
"yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy"
);
return tx;
}

Then:

async function sendEscPos(
characteristic: BluetoothRemoteGATTCharacteristic,
data: Uint8Array
) {
const chunkSize = 182;
for (let i = 0; i < data.length; i += chunkSize) {
await characteristic.writeValueWithoutResponse(
data.slice(i, i + chunkSize)
);
}
}

⸻

For generating the bitmap, something like this:

function makeRasterCommand(
pixels: boolean[][],
) {
const height = pixels.length;
const width = pixels[0].length;
const widthBytes = Math.ceil(width / 8);
const bitmap = new Uint8Array(
widthBytes _ height
);
for (let y = 0; y < height; y++) {
for (let x = 0; x < width; x++) {
if (pixels[y][x]) {
bitmap[y _ widthBytes + (x >> 3)]
|= 1 << (7 - (x & 7));
}
}
}
return new Uint8Array([
0x1b,0x40, // ESC @
0x1d,0x76,0x30,0x00, // GS v 0
widthBytes & 0xff,
widthBytes >> 8,
height & 0xff,
height >> 8,
...bitmap
]);
}

⸻

One caveat: Web Bluetooth support is strongest in Chromium browsers (Chrome, Edge, Android Chrome). Safari does not currently support Web Bluetooth.

The other caveat is that many BLE printers need the connection to stay open while printing. A 384×576 image is:

48 bytes × 576 rows = 27,648 bytes

At 182-byte BLE writes that’s ~152 packets, which is fine.

Given your capture, I think this could become a very clean little web app:

- drag/drop image
- convert to monochrome
- connect to printer
- print

The only missing piece is the UUID discovery. If you can run the characteristic dump above in Chrome, we can map the capture handles to Web Bluetooth UUIDs.
