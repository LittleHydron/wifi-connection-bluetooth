import {Protocol} from './protocol.js';

export class BleClient {
    constructor(srvUuid, charUuid) {
        this.srvUuid = srvUuid;
        this.charUuid = charUuid;
        
        this.device = null;
        this.characteristic = null;

        this.receiveBuffer = [];

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
            this.receiveBuffer = [];
        });

        const server = await this.device.gatt.connect();
        const service = await server.getPrimaryService(this.srvUuid);
        this.characteristic = await service.getCharacteristic(this.charUuid);

        await this.characteristic.startNotifications();
        
        this.characteristic.addEventListener('characteristicvaluechanged', (event) => {
            const chunk = new Uint8Array(event.target.value.buffer);
            
            for (let i = 0; i < chunk.length; i++) {
                const byte = chunk[i];

                if (byte === 3) { 
                    const fullPacket = new Uint8Array(this.receiveBuffer);
                    this.receiveBuffer = [];

                    const data = Protocol.unpack(fullPacket);
                    if (data) {
                        this.onMessage(data.cmdId, data.payload);
                    }
                } else {
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
