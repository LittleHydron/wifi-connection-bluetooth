export const MESSAGES = {
    GET_NETWORKS_CMD: 0x01,
    GET_NETWORKS_RESP: 0x02,

    CONNECT_CMD: 0x03,
    CONNECT_RESP: 0x04,
    
    DISCONNECT_CMD: 0x05,
    DISCONNECT_RESP: 0x06
};

export const Protocol = {
    pack(cmdId, payloadObj) {
        const jsonStr = JSON.stringify(payloadObj);
        const encoder = new TextEncoder();
        const payloadBytes = encoder.encode(jsonStr);

        const buffer = new ArrayBuffer(1 + payloadBytes.length + 2);
        const uint8 = new Uint8Array(buffer);

        uint8[0] = cmdId;
        uint8.set(payloadBytes, 1);
        
        return buffer;
    },

    unpack(dataView) {
        if (dataView.byteLength < 3) return null;

        const cmdId = dataView[0];
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
