import {Protocol} from './protocol.js';

export class BleClient {
    constructor(srvUuid, charUuid) {
        this.srvUuid = srvUuid;
        this.charUuid = charUuid;
        
        this.device = null;
        this.characteristic = null;

        this.onMessage = (cmdId, payload) => { 
            console.log("Received data:", cmdId, payload); 
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

        await this.characteristic.startNotifications();
        this.characteristic.addEventListener('characteristicvaluechanged', (event) => {
            const data = Protocol.unpack(event.target.value);
            if (data) {
                this.onMessage(data.cmdId, data.payload);
            }
        });

        console.log("Connected!");
    }

    async send(cmdId, payload = {}) {
        if (!this.isConnected()) {
            alert("Bluetooth is not connected!");
            return;
        }

        console.log(`Sending CMD: ${cmdId}`, payload);
        const packet = Protocol.pack(cmdId, payload);
        
        await this.characteristic.writeValue(packet);
    }
    
    disconnect() {
        if (this.device) this.device.gatt.disconnect();
    }
}
