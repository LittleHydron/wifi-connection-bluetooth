import {Protocol} from './protocol.js';

export class BleClient {
    constructor(srvUuid, charUuid) {
        this.srvUuid = srvUuid;
        this.charUuid = charUuid;
        
        this.device = null;
        this.characteristic = null;

        this.receiveBuffer = []; // <-- БУФЕР ДЛЯ СКЛЕЮВАННЯ

        this.onMessage = (cmdId, payload) => { 
            console.log("Received:", cmdId, payload); 
        };
        this.onDisconnect = () => console.log("Disconnected");
    }

    isConnected() {
        return this.device && this.device.gatt.connected;
    }

    async connect() {
        console.log("Connecting...");
        this.device = await navigator.bluetooth.requestDevice({
            filters: [{ services: [this.srvUuid] }]
        });

        this.device.addEventListener('gattserverdisconnected', () => {
            this.onDisconnect();
            this.receiveBuffer = []; // Чистимо буфер при розриві
        });

        const server = await this.device.gatt.connect();
        const service = await server.getPrimaryService(this.srvUuid);
        this.characteristic = await service.getCharacteristic(this.charUuid);

        await this.characteristic.startNotifications();
        
        // --- ГОЛОВНА МАГІЯ ТУТ ---
        this.characteristic.addEventListener('characteristicvaluechanged', (event) => {
            const chunk = new Uint8Array(event.target.value.buffer);
            
            // Проходимо по кожному байту
            for (let i = 0; i < chunk.length; i++) {
                const byte = chunk[i];
                console.log(byte)

                if (byte === 3) { 
                    // 1. Знайшли кінець повідомлення!
                    // Перетворюємо масив байтів у Uint8Array
                    const fullPacket = new Uint8Array(this.receiveBuffer);
                    this.receiveBuffer = []; // Очищаємо буфер для наступного разу

                    // 2. Розпаковуємо
                    const data = Protocol.unpack(fullPacket);
                    if (data) {
                        this.onMessage(data.cmdId, data.payload);
                    }
                } else {
                    // 3. Це ще не кінець, додаємо в кошик
                    this.receiveBuffer.push(byte);
                }
            }
        });

        console.log("Connected!");
    }

    async send(cmdId, payload = {}) {
        if (!this.isConnected()) return;

        const rawPacket = Protocol.pack(cmdId, payload);
        const framedPacket = new Uint8Array(rawPacket.byteLength + 1);
        framedPacket.set(new Uint8Array(rawPacket));
        framedPacket[framedPacket.length - 1] = 0x03;
        await this.characteristic.writeValue(framedPacket);
    }
    
    disconnect() {
        if (this.device) this.device.gatt.disconnect();
    }
}
