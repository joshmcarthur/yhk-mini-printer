(() => {
  if (globalThis.__yhkBlePolyfillInstalled) {
    return;
  }
  globalThis.__yhkBlePolyfillInstalled = true;

  const hasNativeBridge = () =>
    Boolean(globalThis.webkit?.messageHandlers?.yhkBluetooth);

  let nextRequestId = 1;
  const pending = new Map();

  const uint8ArrayToBase64 = (bytes) => {
    const chunkSize = 0x8000;
    let binary = "";
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  };

  const callNative = (method, args = {}) => {
    if (!hasNativeBridge()) {
      return Promise.reject(
        new DOMException(
          "Native Bluetooth bridge is unavailable.",
          "SecurityError",
        ),
      );
    }

    return new Promise((resolve, reject) => {
      const id = nextRequestId++;
      pending.set(id, { resolve, reject });
      globalThis.webkit.messageHandlers.yhkBluetooth.postMessage({
        id,
        method,
        args,
      });
    });
  };

  globalThis.__yhkBle = {
    resolve(requestId, result) {
      const handlers = pending.get(requestId);
      if (!handlers) {
        return;
      }
      pending.delete(requestId);
      handlers.resolve(result);
    },
    reject(requestId, error) {
      const handlers = pending.get(requestId);
      if (!handlers) {
        return;
      }
      pending.delete(requestId);
      handlers.reject(
        new DOMException(
          error?.message ?? "Bluetooth operation failed",
          error?.name ?? "Error",
        ),
      );
    },
  };

  class BluetoothRemoteGATTCharacteristic {
    #deviceId;
    #serviceUuid;
    #characteristicUuid;

    constructor(deviceId, serviceUuid, characteristicUuid) {
      this.#deviceId = deviceId;
      this.#serviceUuid = serviceUuid;
      this.#characteristicUuid = characteristicUuid;
    }

    startNotifications() {
      return callNative("startNotifications", {
        deviceId: this.#deviceId,
        serviceUuid: this.#serviceUuid,
        characteristicUuid: this.#characteristicUuid,
      });
    }

    writeValueWithoutResponse(value) {
      const bytes =
        value instanceof Uint8Array ? value : new Uint8Array(value.buffer);
      return callNative("writeValueWithoutResponse", {
        deviceId: this.#deviceId,
        data: uint8ArrayToBase64(bytes),
      });
    }
  }

  class BluetoothRemoteGATTService {
    #deviceId;
    #serviceUuid;

    constructor(deviceId, serviceUuid) {
      this.#deviceId = deviceId;
      this.#serviceUuid = serviceUuid;
    }

    getCharacteristic(characteristicUuid) {
      return Promise.resolve(
        new BluetoothRemoteGATTCharacteristic(
          this.#deviceId,
          this.#serviceUuid,
          characteristicUuid,
        ),
      );
    }
  }

  class BluetoothRemoteGATTServer {
    #deviceId;
    #connected = false;

    constructor(deviceId) {
      this.#deviceId = deviceId;
      this.device = { id: deviceId };
    }

    get connected() {
      return this.#connected;
    }

    async connect() {
      await callNative("gattConnect", { deviceId: this.#deviceId });
      this.#connected = true;
      return this;
    }

    async disconnect() {
      await callNative("gattDisconnect", { deviceId: this.#deviceId });
      this.#connected = false;
    }

    getPrimaryService(serviceUuid) {
      return Promise.resolve(
        new BluetoothRemoteGATTService(this.#deviceId, serviceUuid),
      );
    }
  }

  class BluetoothDevice {
    #gatt;

    constructor(deviceId, name) {
      this.id = deviceId;
      this.name = name;
      this.#gatt = new BluetoothRemoteGATTServer(deviceId);
    }

    get gatt() {
      return this.#gatt;
    }
  }

  const bluetooth = {
    async getConnectionState() {
      const result = await callNative("getConnectionState", {});
      return {
        connected: Boolean(result?.connected),
        deviceId: result?.deviceId,
        name: result?.name,
      };
    },

    async requestDevice() {
      const result = await callNative("requestDevice", {});
      return new BluetoothDevice(result.deviceId, result.name ?? "YHK Printer");
    },
  };

  try {
    Object.defineProperty(navigator, "bluetooth", {
      configurable: true,
      enumerable: true,
      get: () => bluetooth,
    });
  } catch {
    navigator.bluetooth = bluetooth;
  }
})();
