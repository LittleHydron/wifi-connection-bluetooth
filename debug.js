import { BleClient } from './ble-client.js';

// Твої UUID
const CONFIG = {
    SRV_UUID: '12345678-1234-5678-1234-56789abcdef0',
    CHAR_UUID: '12345678-1234-5678-1234-56789abcdef1'
};

const client = new BleClient(CONFIG.SRV_UUID, CONFIG.CHAR_UUID);

// UI елементи
const ui = {
    connectBtn: document.getElementById('connectBtn'),
    sendBtn: document.getElementById('sendBtn'),
    status: document.getElementById('status'),
    controls: document.getElementById('controls'),
    cmdId: document.getElementById('cmdId'),
    respId: document.getElementById('respId'),
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
        client.onDisconnected = () => {
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
        await client.disconnect();
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
    const respId = parseInt(ui.respId.value);
    let payloadObj = {};

    try {
        payloadObj = JSON.parse(ui.payload.value);
    } catch (e) {
        log('❌ Invalid JSON Payload', 'err');
        return;
    }

    log(`TX >> CMD: ${cmdId}, Payload: ${JSON.stringify(payloadObj)}`, 'tx');
    ui.sendBtn.disabled = true;

    try {
        const start = performance.now();
        
        // Використовуємо твій клас для відправки
        const response = await client.sendRequest(cmdId, respId, payloadObj, 100000);
        
        const duration = (performance.now() - start).toFixed(0);
        log(`RX << (${duration}ms) Payload: ${JSON.stringify(response, null, 2)}`, 'rx');

    } catch (e) {
        log(`❌ Error: ${e.message}`, 'err');
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
