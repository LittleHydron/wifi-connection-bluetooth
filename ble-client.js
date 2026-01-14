export const COMMANDS = {
    GET_NETWORKS: 0x01,
    GET_NETWORKS_RESP: 0x02,
    CONNECT: 0x03,
    CONNECT_RESP: 0x04,
    DISCONNECT: 0x05,
    DISCONNECT_RESP: 0x06
};

class BleProtocol {
    static createPacket(commandId, payloadObj) {
        const jsonStr = JSON.stringify(payloadObj);
        const encoder = new TextEncoder();
        const payloadBytes = encoder.encode(jsonStr);

        // ID (1) + Payload (N) + CRC (2)
        const buffer = new ArrayBuffer(1 + payloadBytes.length + 2);
        const uint8 = new Uint8Array(buffer);

        uint8[0] = commandId;
        uint8.set(payloadBytes, 1);
        // CRC залишаємо нулями
        
        return buffer;
    }

    static parsePacket(dataView) {
        const commandId = dataView.getUint8(0);
        // dataView.byteLength - 3 (1 byte ID + 2 bytes CRC)
        const payloadLength = dataView.byteLength - 3; 
        
        if (payloadLength < 0) throw new Error("Packet too short");

        const payloadBytes = new Uint8Array(dataView.buffer, 1, payloadLength);
        const decoder = new TextDecoder();
        const payloadStr = decoder.decode(payloadBytes);

        return { commandId, payload: JSON.parse(payloadStr) };
    }
}

export class BleClient {
    constructor(srvUuid, charUuid) {
        this.srvUuid = srvUuid;
        this.charUuid = charUuid;
        this.device = null;
        this.characteristic = null;
        
        // Карта очікуваних відповідей: ID_відповіді -> { resolve, reject, timer }
        this.pendingRequests = new Map();
        
        // Callback для UI, щоб знати про раптовий розрив
        this.onDisconnected = null;
    }

    isConnected() {
        return this.device && this.device.gatt.connected;
    }

    async connect() {
        if (this.isConnected()) return;

        console.log("Connecting to BLE...");
        this.device = await navigator.bluetooth.requestDevice({
            filters: [{ services: [this.srvUuid] }]
        });

        this.device.addEventListener('gattserverdisconnected', this._handleDisconnect.bind(this));

        const server = await this.device.gatt.connect();
        const service = await server.getPrimaryService(this.srvUuid);
        this.characteristic = await service.getCharacteristic(this.charUuid);

        // Підписуємося на сповіщення
        await this.characteristic.startNotifications();
        this.characteristic.addEventListener('characteristicvaluechanged', this._handleNotification.bind(this));
        
        console.log("BLE Connected!");
    }

    async disconnect() {
        if (this.device) {
            this.device.gatt.disconnect();
        }
    }

    /**
     * Відправляє команду і повертає Promise, який вирішиться, 
     * коли прийде відповідна відповідь.
     */
    async sendRequest(cmdId, expectedRespId, payload = {}, timeoutMs = 15000) {
        if (!this.isConnected()) throw new Error("Device not connected");
        console.log("Sending a request")
        console.log(cmdId);

        return new Promise(async (resolve, reject) => {
            // 1. Ставимо таймер безпеки (якщо сервер завис)
            const timer = setTimeout(() => {
                if (this.pendingRequests.has(expectedRespId)) {
                    this.pendingRequests.delete(expectedRespId);
                    reject(new Error("Timeout: No response from device"));
                }
            }, timeoutMs);

            // 2. Реєструємо цей запит
            this.pendingRequests.set(expectedRespId, { resolve, reject, timer });

            // 3. Відправляємо дані
            try {
                const packet = BleProtocol.createPacket(cmdId, payload);
                await this.characteristic.writeValue(packet);
            } catch (err) {
                clearTimeout(timer);
                this.pendingRequests.delete(expectedRespId);
                reject(err);
            }
        });
    }

    _handleNotification(event) {
        try {
            const { commandId, payload } = BleProtocol.parsePacket(event.target.value);
            console.log(`Received CMD: ${commandId}`, payload);

            // Перевіряємо, чи ми чекаємо на цей ID
            if (this.pendingRequests.has(commandId)) {
                const req = this.pendingRequests.get(commandId);
                
                // Скасовуємо таймер
                clearTimeout(req.timer);
                
                // Вирішуємо проміс
                req.resolve(payload);
                
                // Видаляємо з черги
                this.pendingRequests.delete(commandId);
            } else {
                console.warn("Received unsolicited packet or timed out response:", commandId);
            }

        } catch (e) {
            console.error("Parse error:", e);
        }
    }

    _handleDisconnect() {
        console.log("Disconnected from BLE");
        // Скасовуємо всі завислі запити
        for (const [key, req] of this.pendingRequests) {
            clearTimeout(req.timer);
            req.reject(new Error("Device disconnected"));
        }
        this.pendingRequests.clear();

        if (this.onDisconnected) this.onDisconnected();
    }
}
