import CoreBluetooth
import Foundation

@MainActor
final class PrinterManager: NSObject, ObservableObject {
    @Published private(set) var discoveredDevices: [DiscoveredDevice] = []
    @Published var showDevicePicker = false
    @Published private(set) var isScanning = false

    private var centralManager: CBCentralManager!
    private var requestDeviceContinuation: CheckedContinuation<(id: String, name: String), Error>?

    private var peripheralsById: [String: CBPeripheral] = [:]
    private var connectedPeripheral: CBPeripheral?
    private var connectedDeviceName: String?
    private var txCharacteristic: CBCharacteristic?

    private var connectContinuation: CheckedContinuation<Void, Error>?
    private var discoverContinuation: CheckedContinuation<Void, Error>?

    override init() {
        super.init()
        centralManager = CBCentralManager(delegate: self, queue: nil)
    }

    var isGattConnected: Bool {
        activeConnection() != nil
    }

    func connectionState() -> (id: String, name: String)? {
        activeConnection()
    }

    func requestDevice() async throws -> (id: String, name: String) {
        if let existing = activeConnection() {
            return existing
        }

        try ensurePoweredOn()
        discoveredDevices.removeAll()

        return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<(id: String, name: String), Error>) in
            requestDeviceContinuation = continuation
            showDevicePicker = true
            startScanning()
        }
    }

    func selectDevice(_ device: DiscoveredDevice) {
        stopScanning()
        showDevicePicker = false
        peripheralsById[device.id] = device.peripheral
        connectedDeviceName = device.name
        requestDeviceContinuation?.resume(returning: (device.id, device.name))
        requestDeviceContinuation = nil
    }

    func cancelDevicePicker() {
        stopScanning()
        showDevicePicker = false
        requestDeviceContinuation?.resume(throwing: BluetoothBridgeError.notFound)
        requestDeviceContinuation = nil
    }

    func connect(deviceId: String) async throws {
        try ensurePoweredOn()

        guard let peripheral = peripheral(for: deviceId) else {
            throw BluetoothBridgeError.invalidDeviceId
        }

        peripheralsById[deviceId] = peripheral
        connectedPeripheral = peripheral
        peripheral.delegate = self

        if let existing = activeConnection(), existing.id == deviceId {
            return
        }

        txCharacteristic = nil

        if peripheral.state != .connected {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                connectContinuation = continuation
                centralManager.connect(peripheral, options: nil)
            }
        }

        try await discoverGatt(for: peripheral)
    }

    func disconnect(deviceId: String) {
        guard let peripheral = peripheral(for: deviceId) else {
            return
        }

        if peripheral.state == .connected || peripheral.state == .connecting {
            centralManager.cancelPeripheralConnection(peripheral)
        }

        if connectedPeripheral?.identifier == peripheral.identifier {
            connectedPeripheral = nil
            connectedDeviceName = nil
            txCharacteristic = nil
        }
    }

    func startNotifications(
        deviceId: String,
        serviceUuid: String,
        characteristicUuid: String,
    ) async throws {
        guard let peripheral = peripheral(for: deviceId),
              peripheral.state == .connected,
              let service = peripheral.services?.first(where: { $0.uuid.uuidString.caseInsensitiveCompare(serviceUuid) == .orderedSame }),
              let characteristic = service.characteristics?.first(where: {
                  $0.uuid.uuidString.caseInsensitiveCompare(characteristicUuid) == .orderedSame
              }) else {
            return
        }

        peripheral.setNotifyValue(true, for: characteristic)
    }

    func writeValueWithoutResponse(deviceId: String, data: Data) throws {
        guard let peripheral = peripheral(for: deviceId),
              peripheral.state == .connected,
              let characteristic = txCharacteristic else {
            throw BluetoothBridgeError.notConnected
        }

        let writeType: CBCharacteristicWriteType =
            characteristic.properties.contains(.writeWithoutResponse) ? .withoutResponse : .withResponse
        peripheral.writeValue(data, for: characteristic, type: writeType)
    }

    private func activeConnection() -> (id: String, name: String)? {
        guard let peripheral = connectedPeripheral,
              peripheral.state == .connected,
              txCharacteristic != nil else {
            return nil
        }

        let id = peripheral.identifier.uuidString
        let name = connectedDeviceName ?? peripheral.name ?? "YHK Printer"
        return (id, name)
    }

    private func discoverGatt(for peripheral: CBPeripheral) async throws {
        if let service = peripheral.services?.first(where: { $0.uuid == BleUUID.service }),
           let characteristics = service.characteristics,
           let tx = characteristics.first(where: { $0.uuid == BleUUID.tx }) {
            txCharacteristic = tx
            if let rx = characteristics.first(where: { $0.uuid == BleUUID.rx }) {
                peripheral.setNotifyValue(true, for: rx)
            }
            return
        }

        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            discoverContinuation = continuation
            peripheral.discoverServices([BleUUID.service])
        }
    }

    private func peripheral(for deviceId: String) -> CBPeripheral? {
        if let peripheral = peripheralsById[deviceId] {
            return peripheral
        }

        guard let uuid = UUID(uuidString: deviceId) else {
            return nil
        }

        return centralManager.retrievePeripherals(withIdentifiers: [uuid]).first
    }

    private func startScanning() {
        isScanning = true
        centralManager.scanForPeripherals(withServices: nil, options: [
            CBCentralManagerScanOptionAllowDuplicatesKey: false,
        ])
    }

    private func stopScanning() {
        if isScanning {
            centralManager.stopScan()
            isScanning = false
        }
    }

    private func ensurePoweredOn() throws {
        switch centralManager.state {
        case .poweredOn:
            return
        case .unauthorized:
            throw BluetoothBridgeError.securityError(
                "Bluetooth permission was denied. Enable it in Settings.",
            )
        case .poweredOff:
            throw BluetoothBridgeError.bluetoothUnavailable(
                "Bluetooth is turned off. Enable Bluetooth in Settings.",
            )
        case .unsupported:
            throw BluetoothBridgeError.bluetoothUnavailable(
                "Bluetooth is not supported on this device.",
            )
        case .resetting, .unknown:
            throw BluetoothBridgeError.bluetoothUnavailable(
                "Bluetooth is not ready yet. Try again in a moment.",
            )
        @unknown default:
            throw BluetoothBridgeError.bluetoothUnavailable(
                "Bluetooth is unavailable.",
            )
        }
    }

    private func failConnect(_ error: Error) {
        connectContinuation?.resume(throwing: error)
        connectContinuation = nil
        discoverContinuation?.resume(throwing: error)
        discoverContinuation = nil
    }
}

private func matchesYhkNamePrefix(_ name: String?) -> Bool {
    guard let name else {
        return false
    }
    return name.uppercased().hasPrefix(BleUUID.namePrefix.uppercased())
}

extension PrinterManager: CBCentralManagerDelegate {
    nonisolated func centralManagerDidUpdateState(_ central: CBCentralManager) {
        Task { @MainActor in
            if central.state != .poweredOn, isScanning {
                stopScanning()
            }
        }
    }

    nonisolated func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String: Any],
        rssi RSSI: NSNumber,
    ) {
        let advertisedName = advertisementData[CBAdvertisementDataLocalNameKey] as? String
        let name = peripheral.name ?? advertisedName

        guard matchesYhkNamePrefix(name) else {
            return
        }

        Task { @MainActor in
            let device = DiscoveredDevice(
                id: peripheral.identifier.uuidString,
                name: name ?? "YHK Printer",
                peripheral: peripheral,
            )
            peripheralsById[device.id] = peripheral

            if !discoveredDevices.contains(where: { $0.id == device.id }) {
                discoveredDevices.append(device)
            }
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        Task { @MainActor in
            connectContinuation?.resume()
            connectContinuation = nil
        }
    }

    nonisolated func centralManager(
        _ central: CBCentralManager,
        didFailToConnect peripheral: CBPeripheral,
        error: Error?,
    ) {
        Task { @MainActor in
            failConnect(error ?? BluetoothBridgeError.notConnected)
        }
    }

    nonisolated func centralManager(
        _ central: CBCentralManager,
        didDisconnectPeripheral peripheral: CBPeripheral,
        error: Error?,
    ) {
        Task { @MainActor in
            if connectedPeripheral?.identifier == peripheral.identifier {
                connectedPeripheral = nil
                connectedDeviceName = nil
                txCharacteristic = nil
            }
        }
    }
}

extension PrinterManager: CBPeripheralDelegate {
    nonisolated func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        Task { @MainActor in
            if let error {
                failConnect(error)
                return
            }

            guard let service = peripheral.services?.first(where: { $0.uuid == BleUUID.service }) else {
                failConnect(BluetoothBridgeError.characteristicNotFound)
                return
            }

            peripheral.discoverCharacteristics([BleUUID.tx, BleUUID.rx], for: service)
        }
    }

    nonisolated func peripheral(
        _ peripheral: CBPeripheral,
        didDiscoverCharacteristicsFor service: CBService,
        error: Error?,
    ) {
        Task { @MainActor in
            if let error {
                failConnect(error)
                return
            }

            guard let characteristics = service.characteristics else {
                failConnect(BluetoothBridgeError.characteristicNotFound)
                return
            }

            txCharacteristic = characteristics.first(where: { $0.uuid == BleUUID.tx })

            guard txCharacteristic != nil else {
                failConnect(BluetoothBridgeError.characteristicNotFound)
                return
            }

            connectedDeviceName = connectedDeviceName ?? peripheral.name ?? "YHK Printer"

            if let rxCharacteristic = characteristics.first(where: { $0.uuid == BleUUID.rx }) {
                peripheral.setNotifyValue(true, for: rxCharacteristic)
            }

            discoverContinuation?.resume()
            discoverContinuation = nil
        }
    }
}
