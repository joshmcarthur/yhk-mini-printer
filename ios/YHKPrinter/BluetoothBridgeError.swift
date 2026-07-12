import Foundation

enum BluetoothBridgeError: LocalizedError {
    case notFound
    case securityError(String)
    case notConnected
    case characteristicNotFound
    case invalidDeviceId
    case bluetoothUnavailable(String)

    var errorDescription: String? {
        switch self {
        case .notFound:
            return "No printer selected."
        case .securityError(let message):
            return message
        case .notConnected:
            return "Printer is not connected."
        case .characteristicNotFound:
            return "Printer does not expose a GATT server."
        case .invalidDeviceId:
            return "Invalid printer identifier."
        case .bluetoothUnavailable(let message):
            return message
        }
    }

    var domExceptionName: String {
        switch self {
        case .notFound:
            return "NotFoundError"
        case .securityError, .bluetoothUnavailable:
            return "SecurityError"
        case .notConnected, .characteristicNotFound, .invalidDeviceId:
            return "Error"
        }
    }
}
