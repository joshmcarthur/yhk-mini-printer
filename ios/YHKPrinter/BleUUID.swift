import CoreBluetooth

enum BleUUID {
    static let service = CBUUID(string: "49535343-fe7d-4ae5-8fa9-9fafd205e455")
    static let tx = CBUUID(string: "49535343-8841-43f4-a8d4-ecbe34729bb3")
    static let rx = CBUUID(string: "49535343-1e4d-4bd9-ba61-23c647249616")
    static let namePrefix = "YHK"
}
