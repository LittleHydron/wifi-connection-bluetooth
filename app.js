import { BleClient, COMMANDS } from './ble-client.js';

// --- КОНФІГУРАЦІЯ ---
const CONFIG = {
    SRV_UUID: '12345678-1234-5678-1234-56789abcdef0',
    CHAR_UUID: '12345678-1234-5678-1234-56789abcdef1'
};

// Ініціалізація клієнта
const client = new BleClient(CONFIG.SRV_UUID, CONFIG.CHAR_UUID);
let selectedSsid = null; // Тимчасове збереження вибраної мережі

// --- ОБ'ЄКТ ДЛЯ РОБОТИ З DOM (UI) ---
const ui = {
    status: document.getElementById('connectionStatus'),
    wifiList: document.getElementById('networkList'),
    wifiSection: document.getElementById('wifiSection'),
    connectBtn: document.getElementById('bleConnectBtn'),
    modal: document.getElementById('passwordModal'),
    modalTitle: document.getElementById('modalSsidName'),
    passwordInput: document.getElementById('wifiPassword'),
    confirmBtn: document.getElementById('confirmConnectBtn'),
    
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
            this.connectBtn.innerText = "📡 Підключитися до Raspberry Pi";
            this.wifiSection.classList.add('hidden');
            this.wifiList.innerHTML = '<li class="loading">Очікування підключення...</li>';
        }
    },

    setLoading(isLoading, element = this.wifiList) {
        if (isLoading) {
            element.innerHTML = '<li class="loading">Завантаження...</li>';
        }
    },

    renderNetworks(networks) {
        this.wifiList.innerHTML = ''; 

        if (!networks || networks.length === 0) {
            this.wifiList.innerHTML = '<li class="loading">Мереж не знайдено</li>';
            return;
        }

        networks.forEach(net => {
            const li = document.createElement('li');
            li.className = `network-item ${net.connected ? 'connected-row' : ''}`;

            const lockIcon = net.secure ? '🔒' : '';
            
            // Використовуємо data-attributes для обробки кліків (Event Delegation)
            const actionBtn = net.connected 
                ? `<button class="disconnect-btn" data-action="disconnect" data-ssid="${net.ssid}">Відключити</button>`
                : `<button class="secondary-btn" data-action="connect" data-ssid="${net.ssid}" data-secure="${net.secure}">Підключити</button>`;

            li.innerHTML = `
                <div class="network-info">
                    <span class="ssid">${net.ssid} ${lockIcon}</span>
                    <span class="signal">Signal: ${net.signal}%</span>
                </div>
                <div>${actionBtn}</div>
            `;
            this.wifiList.appendChild(li);
        });
    },

    toggleModal(show, ssid = '') {
        if (show) {
            this.modalTitle.innerText = ssid;
            this.passwordInput.value = '';
            this.modal.classList.remove('hidden');
            this.passwordInput.focus();
        } else {
            this.modal.classList.add('hidden');
        }
    },

    setButtonLoading(btn, isLoading, loadingText = "Processing...", originalText = "OK") {
        if (isLoading) {
            btn.disabled = true;
            btn.innerText = loadingText;
        } else {
            btn.disabled = false;
            btn.innerText = originalText;
        }
    }
};

// --- ГОЛОВНА ЛОГІКА ПРОГРАМИ ---
const app = {
    init() {
        // 1. Прив'язка глобальних кнопок
        document.getElementById('bleConnectBtn').addEventListener('click', () => this.connectBle());
        document.getElementById('refreshBtn').addEventListener('click', () => this.scanNetworks());
        
        // 2. Прив'язка кнопок модалки
        ui.confirmBtn.addEventListener('click', () => this.confirmConnection());
        document.getElementById('cancelModalBtn').addEventListener('click', () => ui.toggleModal(false));

        // 3. Делегування подій для списку мереж (динамічні кнопки)
        ui.wifiList.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;

            const { action, ssid, secure } = btn.dataset;
            if (action === 'connect') this.handleConnectClick(ssid, secure === 'true');
            if (action === 'disconnect') this.handleDisconnectClick(ssid);
        });

        // 4. Обробка розриву з'єднання (з боку клієнта)
        client.onDisconnected = () => {
            console.log("BLE Disconnected event caught in UI");
            ui.setConnected(false);
        };
    },

    async connectBle() {
        try {
            ui.setButtonLoading(ui.connectBtn, true, "Підключення...", "📡 Підключитися до Raspberry Pi");
            
            await client.connect();
            
            ui.setConnected(true);
            this.scanNetworks();

        } catch (error) {
            console.error(error);
            alert("Не вдалося підключитися: " + error.message);
            ui.setConnected(false); 
        } finally {
            ui.setButtonLoading(ui.connectBtn, false, "", "📡 Підключитися до Raspberry Pi");
        }
    },

    async scanNetworks() {
        ui.setLoading(true);
        try {
            // Використовуємо новий метод sendRequest
            const networks = await client.sendRequest(
                COMMANDS.GET_NETWORKS, 
                COMMANDS.GET_NETWORKS_RESP
            );
            
            console.log("Networks received:", networks);
            ui.renderNetworks(networks);

        } catch (error) {
            console.error(error);
            ui.wifiList.innerHTML = `<li class="loading" style="color:red">Помилка: ${error.message}</li>`;
        }
    },

    handleConnectClick(ssid, isSecure) {
        selectedSsid = ssid;
        if (!isSecure) {
            // Відкрита мережа - підключаємося без пароля
            if (confirm(`Підключитися до відкритої мережі ${ssid}?`)) {
                this.performConnection(ssid, "");
            }
        } else {
            // Захищена мережа - відкриваємо модалку
            ui.toggleModal(true, ssid);
        }
    },

    async confirmConnection() {
        const password = ui.passwordInput.value;
        if (!password) {
            alert("Будь ласка, введіть пароль");
            return;
        }
        await this.performConnection(selectedSsid, password);
    },

    async performConnection(ssid, password) {
        const originalText = ui.confirmBtn.innerText;
        
        try {
            ui.setButtonLoading(ui.confirmBtn, true, "З'єднання...", originalText);

            // Збільшуємо таймаут до 25 секунд, бо підключення до WiFi займає час
            const response = await client.sendRequest(
                COMMANDS.CONNECT,
                COMMANDS.CONNECT_RESP,
                { ssid: ssid, password: password },
                25000 
            );

            if (response.success) {
                alert(`Успішно підключено до ${response.ssid}`);
                ui.toggleModal(false);
                this.scanNetworks(); // Оновити список
            } else {
                alert(`Помилка підключення: ${response.message}`);
            }

        } catch (error) {
            console.error(error);
            alert("Помилка зв'язку: " + error.message);
        } finally {
            ui.setButtonLoading(ui.confirmBtn, false, "", originalText);
        }
    },

    async handleDisconnectClick(ssid) {
        if (!confirm(`Ви точно хочете відключитися від ${ssid}?`)) return;

        // Показуємо лоадер на кнопці (або блокуємо інтерфейс)
        // Тут для простоти просто перезавантажимо список з текстом
        ui.setLoading(true); 

        try {
            const response = await client.sendRequest(
                COMMANDS.DISCONNECT,
                COMMANDS.DISCONNECT_RESP,
                { ssid: ssid }
            );

            if (response.success) {
                this.scanNetworks();
            } else {
                alert("Не вдалося відключитися");
                this.scanNetworks(); // Все одно оновимо список
            }
        } catch (error) {
            alert("Помилка: " + error.message);
            this.scanNetworks();
        }
    }
};

// Запуск програми
app.init();
