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

        // ID (1) + Payload (N) + Delimiter (1)
        const buffer = new ArrayBuffer(1 + payloadBytes.length + 1);
        const uint8 = new Uint8Array(buffer);

        uint8[0] = cmdId;
        uint8.set(payloadBytes, 1);
        uint8[uint8.length - 1] = 0x03; // Додаємо маркер кінця (ETX)
        
        return buffer;
    },

    // Розпаковуємо вже ПОВНЕ повідомлення
    unpack(uint8Array) {
        if (uint8Array.length < 2) return null; 

        const cmdId = uint8Array[0];
        // Відрізаємо перший байт (ID)
        const payloadBytes = uint8Array.slice(1); 
        
        const decoder = new TextDecoder();
        try {
            const jsonStr = decoder.decode(payloadBytes);
            return { cmdId, payload: JSON.parse(jsonStr) };
        } catch (e) {
            console.error("JSON Parse Error:", e);
            console.log("Raw text was:", decoder.decode(payloadBytes));
            return { cmdId, payload: {} };
        }
    }
};
