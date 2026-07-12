import SwiftUI

struct DevicePickerView: View {
    @ObservedObject var printerManager: PrinterManager
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if printerManager.discoveredDevices.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "dot.radiowaves.left.and.right")
                            .font(.largeTitle)
                        Text("Searching")
                            .font(.headline)
                        Text("Turn on your YHK printer and keep it nearby.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .padding()
                } else {
                    List(printerManager.discoveredDevices) { device in
                        Button {
                            printerManager.selectDevice(device)
                            dismiss()
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(device.name)
                                    .font(.headline)
                                Text(device.id)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Select Printer")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        printerManager.cancelDevicePicker()
                        dismiss()
                    }
                }
            }
        }
    }
}
