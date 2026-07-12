import Foundation
import SwiftUI
import UniformTypeIdentifiers
import WebKit

struct WebView: UIViewRepresentable {
    @ObservedObject var printerManager: PrinterManager

    func makeCoordinator() -> Coordinator {
        Coordinator(printerManager: printerManager)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        let controller = configuration.userContentController
        controller.add(context.coordinator.bridge, name: "yhkBluetooth")

        if let polyfillURL = Bundle.main.url(
            forResource: "web_bluetooth_polyfill",
            withExtension: "js",
        ),
            let polyfillSource = try? String(contentsOf: polyfillURL, encoding: .utf8) {
            let script = WKUserScript(
                source: polyfillSource,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true,
            )
            controller.addUserScript(script)
        }

        if let webDirectory = Bundle.main.url(forResource: "Web", withExtension: nil) {
            configuration.setURLSchemeHandler(
                BundleWebSchemeHandler(baseDirectory: webDirectory),
                forURLScheme: "yhkapp",
            )
        }

        let preferences = configuration.preferences
        preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")

        let webView = WKWebView(frame: .zero, configuration: configuration)
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }
        context.coordinator.bridge.attach(webView: webView)

        if let startURL = URL(string: "yhkapp://localhost/index.html") {
            webView.load(URLRequest(url: startURL))
        }

        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    @MainActor
    final class Coordinator {
        let bridge: BluetoothBridge

        init(printerManager: PrinterManager) {
            bridge = BluetoothBridge(printerManager: printerManager)
        }
    }
}

private final class BundleWebSchemeHandler: NSObject, WKURLSchemeHandler {
    private let baseDirectory: URL

    init(baseDirectory: URL) {
        self.baseDirectory = baseDirectory
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        serve(urlSchemeTask)
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

    private func serve(_ urlSchemeTask: WKURLSchemeTask) {
        guard let requestURL = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(URLError(.badURL))
            return
        }

        let relativePath = Self.relativePath(from: requestURL)
        let fileURL = baseDirectory.appendingPathComponent(relativePath)

        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            urlSchemeTask.didFailWithError(URLError(.fileDoesNotExist))
            return
        }

        do {
            let data = try Data(contentsOf: fileURL)
            let mimeType = Self.mimeType(for: fileURL)
            let response = URLResponse(
                url: requestURL,
                mimeType: mimeType,
                expectedContentLength: data.count,
                textEncodingName: nil,
            )
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(data)
            urlSchemeTask.didFinish()
        } catch {
            urlSchemeTask.didFailWithError(error)
        }
    }

    private static func relativePath(from url: URL) -> String {
        var path = url.path
        if path.hasPrefix("/") {
            path.removeFirst()
        }
        if path.isEmpty {
            return "index.html"
        }
        return path
    }

    private static func mimeType(for fileURL: URL) -> String {
        if let type = UTType(filenameExtension: fileURL.pathExtension),
           let mimeType = type.preferredMIMEType {
            return mimeType
        }

        switch fileURL.pathExtension.lowercased() {
        case "html":
            return "text/html"
        case "js":
            return "application/javascript"
        case "css":
            return "text/css"
        case "webm":
            return "video/webm"
        case "json":
            return "application/json"
        case "svg":
            return "image/svg+xml"
        case "png":
            return "image/png"
        case "jpg", "jpeg":
            return "image/jpeg"
        default:
            return "application/octet-stream"
        }
    }
}
