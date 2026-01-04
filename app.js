// --- КОНФІГУРАЦІЯ ---
const CONFIG = {
    SRV_UUID: '12345678-1234-5678-1234-56789abcdef0',
    CHAR_UUID: '12345678-1234-5678-1234-56789abcdef1'
};

const COMMANDS = {
    GET_NETWORKS: 0x01,
    GET_NETWORKS_RESP: 0x02,
    CONNECT: 0x03,
    CONNECT_RESP: 0x04,
    DISCONNECT: 0x05,
    DISCONNECT_RESP: 0x06
};

// --- ЛОГІКА ПРОТОКОЛУ (ПАКУВАННЯ) ---
class BleProtocol {
    static createPacket(commandId, payloadStr = "") {
        const encoder = new TextEncoder();
        const payloadBytes = encoder.encode(payloadStr);

        // Структура: [ID (1)] + [Payload (N)] + [CRC (2)]
        // Поки що CRC = 0x0000, як у Python
        const buffer = new ArrayBuffer(1 + payloadBytes.length + 2);
        const view = new DataView(buffer);
        const uint8 = new Uint8Array(buffer);

        // 1. Command ID
        uint8[0] = commandId;

        // 2. Payload
        for (let i = 0; i < payloadBytes.length; i++) {
            uint8[1 + i] = payloadBytes[i];
        }

        // 3. CRC (останні 2 байти) - залишаємо 0, бо Python поки ігнорує валідацію CRC
        // Якщо треба буде CRC, додамо логіку тут

        return buffer;
    }

    static parsePacket(dataView) {
        // [ID (1)] + [Payload (N)] + [CRC (2)]
        const commandId = dataView.getUint8(0);
        
        // Вирізаємо payload (все між 1-м байтом і останніми двома)
        const payloadLength = dataView.byteLength - 3;
        const payloadBytes = new Uint8Array(dataView.buffer, 1, payloadLength);
        
        const decoder = new TextDecoder();
        const payloadStr = decoder.decode(payloadBytes);

        return { commandId, payload: JSON.parse(payloadStr) };
    }
}

// --- ЛОГІКА ІНТЕРФЕЙСУ ---
let bleCharacteristic = null;
let selectedSsid = null;

const ui = {
    status: document.getElementById('connectionStatus'),
    wifiList: document.getElementById('networkList'),
    wifiSection: document.getElementById('wifiSection'),
    connectBtn: document.getElementById('bleConnectBtn'),
    modal: document.getElementById('passwordModal'),
    modalTitle: document.getElementById('modalSsidName'),
    passwordInput: document.getElementById('wifiPassword'),
    
    setConnected(isConnected) {
        if (isConnected) {
            this.status.textContent = "Connected via BLE";
            this.status.className = "status-badge connected";
            this.connectBtn.style.display = 'none';
            this.wifiSection.classList.remove('hidden');
        } else {
            this.status.textContent = "Disconnected";
            this.status.className = "status-badge disconnected";
            this.connectBtn.style.display = 'block';
            this.connectBtn.disabled = false;
            this.wifiSection.classList.add('hidden');
            this.wifiList.innerHTML = '<li class="loading">Очікування підключення...</li>';
        }
    },

    renderNetworks(networks) {
        this.wifiList.innerHTML = ''; // Очистити список

        if (networks.length === 0) {
            this.wifiList.innerHTML = '<li class="loading">Мереж не знайдено</li>';
            return;
        }

        networks.forEach(net => {
            const li = document.createElement('li');
            li.className = `network-item ${net.connected ? 'connected-row' : ''}`;

            const lockIcon = net.secure ? '🔒' : '';
            const actionBtn = net.connected 
                ? `<button class="disconnect-btn" onclick="app.disconnect('${net.ssid}')">Відключити</button>`
                : `<button class="secondary-btn" onclick="app.openConnectModal('${net.ssid}', ${net.secure})">Підключити</button>`;

            li.innerHTML = `
                <div class="network-info">
                    <span class="ssid">${net.ssid} ${lockIcon}</span>
                    <span class="signal">Signal: ${net.signal}%</span>
                </div>
                <div>${actionBtn}</div>
            `;
            this.wifiList.appendChild(li);
        });
    }
};

// --- ГОЛОВНА ЛОГІКА (APP) ---
const app = {
    async init() {
        document.getElementById('bleConnectBtn').addEventListener('click', () => this.connectBle());
        document.getElementById('refreshBtn').addEventListener('click', () => this.scanNetworks());
        
        document.getElementById('confirmConnectBtn').addEventListener('click', () => this.confirmConnection());
        document.getElementById('cancelModalBtn').addEventListener('click', () => ui.modal.classList.add('hidden'));
    },

    async connectBle() {
        try {
            ui.connectBtn.disabled = true;
            ui.connectBtn.innerText = "Підключення...";

            // 1. Пошук пристрою
            const device = await navigator.bluetooth.requestDevice({
                filters: [{ services: [CONFIG.SRV_UUID] }]
            });

            device.addEventListener('gattserverdisconnected', () => ui.setConnected(false));

            const server = await device.gatt.connect();
            const service = await server.getPrimaryService(CONFIG.SRV_UUID);
            bleCharacteristic = await service.getCharacteristic(CONFIG.CHAR_UUID);

            // 2. Підписка на відповіді
            await bleCharacteristic.startNotifications();
            bleCharacteristic.addEventListener('characteristicvaluechanged', (e) => this.handleResponse(e));

            ui.setConnected(true);
            
            // 3. Автоматично запускаємо сканування після підключення
            this.scanNetworks();

        } catch (error) {
            console.error(error);
            alert("Помилка підключення: " + error);
            ui.connectBtn.disabled = false;
            ui.connectBtn.innerText = "📡 Підключитися до Raspberry Pi";
        }
    },

    async sendCommand(id, payload = {}) {
        if (!bleCharacteristic) return;
        const jsonStr = JSON.stringify(payload);
        const packet = BleProtocol.createPacket(id, jsonStr);
        await bleCharacteristic.writeValue(packet);
    },

    handleResponse(event) {
        try {
            const result = BleProtocol.parsePacket(event.target.value);
            console.log("Отримано команду:", result);

            switch (result.commandId) {
                case COMMANDS.GET_NETWORKS_RESP:
                    ui.renderNetworks(result.payload);
                    break;
                
                case COMMANDS.CONNECT_RESP:
                    if (result.payload.success) {
                        alert(`Успішно підключено до ${result.payload.ssid}`);
                        ui.modal.classList.add('hidden');
                        this.scanNetworks(); // Оновити список, щоб показати статус Connected
                    } else {
                        alert("Помилка підключення: " + (result.payload.message || "Unknown error"));
                    }
                    break;

                case COMMANDS.DISCONNECT_RESP:
                    if (result.payload.success) {
                        alert(`Відключено від ${result.payload.ssid}`);
                        this.scanNetworks();
                    }
                    break;
            }
        } catch (e) {
            console.error("Помилка парсингу відповіді:", e);
        }
    },

    scanNetworks() {
        ui.wifiList.innerHTML = '<li class="loading">Сканування... (3-5 сек)</li>';
        this.sendCommand(COMMANDS.GET_NETWORKS);
    },

    openConnectModal(ssid, secure) {
        selectedSsid = ssid;
        if (!secure) {
            // Якщо мережа відкрита, підключаємося одразу без пароля
            if(confirm(`Підключитися до відкритої мережі ${ssid}?`)) {
                this.sendCommand(COMMANDS.CONNECT, { ssid: ssid, password: "" });
            }
            return;
        }
        
        ui.modalTitle.innerText = ssid;
        ui.passwordInput.value = '';
        ui.modal.classList.remove('hidden');
    },

    confirmConnection() {
        const password = ui.passwordInput.value;
        if (!password) {
            alert("Введіть пароль!");
            return;
        }
        
        // Візуально показуємо процес
        const btn = document.getElementById('confirmConnectBtn');
        const originalText = btn.innerText;
        btn.innerText = "З'єднання...";
        btn.disabled = true;

        this.sendCommand(COMMANDS.CONNECT, { ssid: selectedSsid, password: password });

        // Відновлюємо кнопку через деякий час (реальна відповідь прийде через BLE)
        setTimeout(() => {
            btn.innerText = originalText;
            btn.disabled = false;
        }, 3000);
    },

    disconnect(ssid) {
        if(confirm(`Розірвати з'єднання з ${ssid}?`)) {
            this.sendCommand(COMMANDS.DISCONNECT, { ssid: ssid });
        }
    }
};

// Експортуємо функції в глобальну область для HTML onclick
window.app = app;
app.init();
