declare module "@abandonware/noble" {
  import { EventEmitter } from "node:events";

  export interface Advertisement {
    localName?: string;
  }

  export interface Characteristic extends EventEmitter {
    uuid: string;
    properties: string[];
    subscribe(callback: (error?: Error) => void): void;
    write(
      data: Buffer,
      withoutResponse: boolean,
      callback: (error?: Error) => void,
    ): void;
  }

  export interface Peripheral extends EventEmitter {
    id: string;
    address: string;
    state: string;
    rssi: number;
    advertisement: Advertisement;
    connect(callback: (error?: Error) => void): void;
    disconnect(callback: () => void): void;
    discoverServices(
      serviceUuids: string[],
      callback: (error: Error | null, services: Service[]) => void,
    ): void;
    discoverSomeServicesAndCharacteristics(
      serviceUuids: string[],
      characteristicUuids: string[],
      callback: (
        error: Error | null,
        services: Service[],
        characteristics: Characteristic[],
      ) => void,
    ): void;
  }

  export interface Service extends EventEmitter {
    uuid: string;
    discoverCharacteristics(
      characteristicUuids: string[] | null | undefined,
      callback: (error: Error | null, characteristics: Characteristic[]) => void,
    ): void;
  }

  interface Noble extends EventEmitter {
    state: string;
    startScanning(serviceUuids: string[], allowDuplicates: boolean): void;
    stopScanning(): void;
  }

  const noble: Noble;
  export default noble;
}
