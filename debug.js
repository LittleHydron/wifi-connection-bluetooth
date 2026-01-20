import { BleClient } from './ble-client.js';

// Твої UUID
const CONFIG = {
    SRV_UUID: '12345678-1234-5678-1234-56789abcdef0',
    CHAR_UUID: '12345678-1234-5678-1234-56789abcdef1'
};

const client = new BleClient(CONFIG.SRV_UUID, CONFIG.CHAR_UUID);

// --- ВАЖЛИВО: Глобальний слухач відповідей ---
// Сюди будуть падати всі відповіді від Raspberry Pi
client.onMessage = (cmdId, payload) => {
    log(`RX << CMD: ${cmdId}, Payload: ${JSON.stringify(payload, null, 2)}`, 'rx');
};

// UI елементи
const ui = {
    connectBtn: document.getElementById('connectBtn'),
    sendBtn: document.getElementById('sendBtn'),
    status: document.getElementById('status'),
    controls: document.getElementById('controls'),
    cmdId: document.getElementById('cmdId'),
    payload: document.getElementById('payload'),
    logArea: document.getElementById('logArea'),
};

// --- LOGGING ---
function log(msg, type = 'sys') {
    const time = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.className = `log-${type}`;
    line.innerText = `[${time}] ${msg}`;
    ui.logArea.prepend(line); // Нові зверху
}

// --- LOGIC ---
async function connect() {
    try {
        ui.connectBtn.disabled = true;
        log('Connecting...', 'sys');
        
        await client.connect();
        
        log('✅ Connected!', 'sys');
        ui.status.innerText = 'Status: Connected';
        ui.connectBtn.innerText = '❌ DISCONNECT';
        ui.controls.style.opacity = '1';
        ui.controls.style.pointerEvents = 'auto';

        // Обробка розриву
        client.onDisconnect = () => {
            log('⚠️ Disconnected event', 'err');
            resetUI();
        };

    } catch (e) {
        log(`Connection failed: ${e.message}`, 'err');
        ui.connectBtn.disabled = false;
    }
}

async function disconnect() {
    try {
        client.disconnect(); // Це синхронна дія в новому клієнті
        resetUI();
    } catch (e) {
        log(`Disconnect error: ${e.message}`, 'err');
    }
}

function resetUI() {
    ui.status.innerText = 'Status: Disconnected';
    ui.connectBtn.innerText = '🔌 CONNECT BLE';
    ui.connectBtn.disabled = false;
    ui.controls.style.opacity = '0.5';
    ui.controls.style.pointerEvents = 'none';
}

async function sendData() {
    const cmdId = parseInt(ui.cmdId.value);
    // respId нам більше не потрібен, бо ми не чекаємо конкретну відповідь
    
    let payloadObj = {};

    try {
        payloadObj = JSON.parse(ui.payload.value);
    } catch (e) {
        log('❌ Invalid JSON Payload. Example: {"ssid": "test"} or {}', 'err');
        return;
    }

    log(`TX >> CMD: ${cmdId}, Payload: ${JSON.stringify(payloadObj)}`, 'tx');
    ui.sendBtn.disabled = true;

    try {
        // Використовуємо новий простий метод send
        // Він вирішиться, як тільки дані підуть в ефір (fire and forget)
        await client.send(cmdId, payloadObj);
        
        log('✅ Sent successfully (waiting for response...)', 'sys');

    } catch (e) {
        log(`❌ Send Error: ${e.message}`, 'err');
    } finally {
        ui.sendBtn.disabled = false;
    }
}

// --- EVENTS ---
ui.connectBtn.addEventListener('click', () => {
    if (client.isConnected()) disconnect();
    else connect();
});

ui.sendBtn.addEventListener('click', sendData);

// Дефолтні значення для зручності
ui.payload.value = JSON.stringify({}, null, 2);