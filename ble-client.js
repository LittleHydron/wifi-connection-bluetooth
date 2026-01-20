export const COMMANDS = {
    GET_NETWORKS: 0x01,
    GET_NETWORKS_RESP: 0x02,
    CONNECT: 0x03,
    CONNECT_RESP: 0x04,
    DISCONNECT: 0x05,
    DISCONNECT_RESP: 0x06
};

// Простий пакувальник/розпакувальник байтів
const Protocol = {
    pack(cmdId, payloadObj) {
        const jsonStr = JSON.stringify(payloadObj);
        const encoder = new TextEncoder();
        const payloadBytes = encoder.encode(jsonStr);

        // 1 байт ID + Payload + 2 байти CRC (пустих)
        const buffer = new ArrayBuffer(1 + payloadBytes.length + 2);
        const uint8 = new Uint8Array(buffer);

        uint8[0] = cmdId;
        uint8.set(payloadBytes, 1);
        
        return buffer;
    },

    unpack(dataView) {
        if (dataView.byteLength < 3) return null; // Занадто короткий пакет

        const cmdId = dataView.getUint8(0);
        const payloadLen = dataView.byteLength - 3;
        
        const payloadBytes = new Uint8Array(dataView.buffer, 1, payloadLen);
        const decoder = new TextDecoder();
        
        try {
            const jsonStr = decoder.decode(payloadBytes);
            return { cmdId, payload: JSON.parse(jsonStr) };
        } catch (e) {
            console.error("JSON Error:", e);
            return { cmdId, payload: {} };
        }
    }
};

export class BleClient {
    constructor(srvUuid, charUuid) {
        this.srvUuid = srvUuid;
        this.charUuid = charUuid;
        
        this.device = null;
        this.characteristic = null;

        // Це функція-заглушка. Ти перепишеш її в app.js
        this.onMessage = (cmdId, payload) => { 
            console.log("Отримано дані (не оброблено):", cmdId, payload); 
        };
        
        this.onDisconnect = () => console.log("Disconnected");
    }

    isConnected() {
        return this.device && this.device.gatt.connected && this.characteristic;
    }

    async connect() {
        console.log("Connecting...");
        this.device = await navigator.bluetooth.requestDevice({
            filters: [{ services: [this.srvUuid] }]
        });

        this.device.addEventListener('gattserverdisconnected', () => {
            this.onDisconnect();
        });

        const server = await this.device.gatt.connect();
        const service = await server.getPrimaryService(this.srvUuid);
        this.characteristic = await service.getCharacteristic(this.charUuid);

        // Вмикаємо слухача
        await this.characteristic.startNotifications();
        this.characteristic.addEventListener('characteristicvaluechanged', (event) => {
            const data = Protocol.unpack(event.target.value);
            if (data) {
                // Просто викликаємо твій колбек. Ніякої магії.
                this.onMessage(data.cmdId, data.payload);
            }
        });

        console.log("Connected!");
    }

    async send(cmdId, payload = {}) {
        if (!this.isConnected()) {
            alert("Bluetooth не підключено!");
            return;
        }

        console.log(`Sending CMD: ${cmdId}`, payload);
        const packet = Protocol.pack(cmdId, payload);
        
        // Просто пишемо. Якщо помилка - вона вилетить тут.
        await this.characteristic.writeValue(packet);
    }
    
    disconnect() {
        if (this.device) this.device.gatt.disconnect();
    }
}
