import CoreBluetooth
import Foundation

struct DiscoveredDevice: Identifiable, Equatable {
    let id: String
    let name: String
    let peripheral: CBPeripheral

    static func == (lhs: DiscoveredDevice, rhs: DiscoveredDevice) -> Bool {
        lhs.id == rhs.id
    }
}
