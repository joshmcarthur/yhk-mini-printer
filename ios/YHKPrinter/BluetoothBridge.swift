import Foundation
import WebKit

@MainActor
final class BluetoothBridge: NSObject, WKScriptMessageHandler {
    private weak var webView: WKWebView?
    private let printerManager: PrinterManager

    init(printerManager: PrinterManager) {
        self.printerManager = printerManager
    }

    func attach(webView: WKWebView) {
        self.webView = webView
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
    ) {
        guard message.name == "yhkBluetooth",
              let body = message.body as? [String: Any],
              let requestId = body["id"] as? Int,
              let method = body["method"] as? String else {
            return
        }

        let args = body["args"] as? [String: Any] ?? [:]

        Task {
            do {
                let result = try await handle(method: method, args: args)
                resolve(requestId: requestId, result: result)
            } catch {
                reject(requestId: requestId, error: error)
            }
        }
    }

    private func handle(method: String, args: [String: Any]) async throws -> [String: Any]? {
        switch method {
        case "requestDevice":
            let device = try await printerManager.requestDevice()
            return [
                "deviceId": device.id,
                "name": device.name,
            ]
        case "getConnectionState":
            if let connection = printerManager.connectionState() {
                return [
                    "connected": true,
                    "deviceId": connection.id,
                    "name": connection.name,
                ]
            }
            return ["connected": false]
        case "gattConnect":
            let deviceId = try requiredString(args, key: "deviceId")
            try await printerManager.connect(deviceId: deviceId)
            return nil
        case "gattDisconnect":
            let deviceId = try requiredString(args, key: "deviceId")
            printerManager.disconnect(deviceId: deviceId)
            return nil
        case "startNotifications":
            let deviceId = try requiredString(args, key: "deviceId")
            let serviceUuid = try requiredString(args, key: "serviceUuid")
            let characteristicUuid = try requiredString(args, key: "characteristicUuid")
            try await printerManager.startNotifications(
                deviceId: deviceId,
                serviceUuid: serviceUuid,
                characteristicUuid: characteristicUuid,
            )
            return nil
        case "writeValueWithoutResponse":
            let deviceId = try requiredString(args, key: "deviceId")
            let dataBase64 = try requiredString(args, key: "data")
            guard let data = Data(base64Encoded: dataBase64) else {
                throw BluetoothBridgeError.invalidDeviceId
            }
            try printerManager.writeValueWithoutResponse(deviceId: deviceId, data: data)
            return nil
        default:
            throw BluetoothBridgeError.bluetoothUnavailable("Unsupported Bluetooth method: \(method)")
        }
    }

    private func requiredString(_ args: [String: Any], key: String) throws -> String {
        guard let value = args[key] as? String, !value.isEmpty else {
            throw BluetoothBridgeError.invalidDeviceId
        }
        return value
    }

    private func resolve(requestId: Int, result: [String: Any]?) {
        guard let webView else {
            return
        }

        let payload: String
        if let result {
            guard let data = try? JSONSerialization.data(withJSONObject: result),
                  let json = String(data: data, encoding: .utf8) else {
                payload = "null"
                return
            }
            payload = json
        } else {
            payload = "null"
        }

        webView.evaluateJavaScript("window.__yhkBle.resolve(\(requestId), \(payload))")
    }

    private func reject(requestId: Int, error: Error) {
        guard let webView else {
            return
        }

        let bridgeError = error as? BluetoothBridgeError
        let name = bridgeError?.domExceptionName ?? "Error"
        let message = error.localizedDescription
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
            .replacingOccurrences(of: "\n", with: "\\n")

        webView.evaluateJavaScript(
            "window.__yhkBle.reject(\(requestId), { name: '\(name)', message: '\(message)' })",
        )
    }
}
