import SwiftUI

struct ContentView: View {
    @StateObject private var printerManager = PrinterManager()

    var body: some View {
        WebView(printerManager: printerManager)
            .ignoresSafeArea(edges: .bottom)
            .sheet(isPresented: $printerManager.showDevicePicker) {
                DevicePickerView(printerManager: printerManager)
            }
    }
}

#Preview {
    ContentView()
}
