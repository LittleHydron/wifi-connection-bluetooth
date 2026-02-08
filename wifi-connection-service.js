import { BleClient } from './ble-client.js';
import { MESSAGES } from './protocol.js';

const CONFIG = {
    SRV_UUID: '12345678-1234-5678-1234-56789abcdef0',
    CHAR_UUID: '12345678-1234-5678-1234-56789abcdef1'
};

export class WifiConnectionService {
    constructor() {
        this.client = new BleClient(CONFIG.SRV_UUID, CONFIG.CHAR_UUID);
        
        // Waiting queue: { RESP_ID: { resolve, reject, timer } }
        this.pendingRequests = new Map();

        this.client.onMessage = (cmdId, payload) => {
            if (this.pendingRequests.has(cmdId)) {
                const req = this.pendingRequests.get(cmdId);
                clearTimeout(req.timer);
                req.resolve(payload);
                this.pendingRequests.delete(cmdId);
            } else {
                console.log(`⚠️ Отримано неочікувану команду: ${cmdId}`, payload);
            }
        };
    }

    async connectClient() {
        if (!this.client.isConnected()) {
            await this.client.connect();
        }
    }

    disconnectClient() {
        if (this.client.isConnected()) {
            this.client.disconnect();
        }
    }

    async getAvailableNetworks() {
        const networks = await this._sendAndWait(
            MESSAGES.GET_NETWORKS_CMD,
            MESSAGES.GET_NETWORKS_RESP,
            {},
            10000
        );
        return networks || [];
    }

    async connectToNetwork(ssid, password = "") {
        const response = await this._sendAndWait(
            MESSAGES.CONNECT_CMD,
            MESSAGES.CONNECT_RESP,
            { ssid, password },
            25000
        );
        
        if (!response.success) {
            console.error("Connection failed:", response.message);
        }
        return response.success;
    }

    async disconnectFromNetwork(ssid) {
        const response = await this._sendAndWait(
            MESSAGES.DISCONNECT_CMD,
            MESSAGES.DISCONNECT_RESP,
            { ssid }
        );
        return response.success;
    }

    _sendAndWait(cmdId, expectedRespId, payload, timeoutMs = 5000) {
        return new Promise(async (resolve, reject) => {
            const timer = setTimeout(() => {
                if (this.pendingRequests.has(expectedRespId)) {
                    this.pendingRequests.delete(expectedRespId);
                    reject(new Error(`Timeout: No response for CMD ${expectedRespId}`));
                }
            }, timeoutMs);

            this.pendingRequests.set(expectedRespId, { resolve, reject, timer });

            try {
                await this.client.send(cmdId, payload);
            } catch (err) {
                clearTimeout(timer);
                this.pendingRequests.delete(expectedRespId);
                reject(err);
            }
        });
    }
}
