import { WifiConnectionService } from './wifi-connection-service.js';

// Створюємо екземпляр сервісу
const wifiService = new WifiConnectionService();
let selectedSsid = null; // Запам'ятовуємо, яку мережу юзер хоче підключити

// --- UI HELPERS ---
// Об'єкт для зручного доступу до елементів HTML
const ui = {
    status: document.getElementById('connectionStatus'),
    wifiList: document.getElementById('networkList'),
    wifiSection: document.getElementById('wifiSection'),
    connectBtn: document.getElementById('bleConnectBtn'),
    refreshBtn: document.getElementById('refreshBtn'),
    
    // Модальне вікно
    modal: document.getElementById('passwordModal'),
    modalTitle: document.getElementById('modalSsidName'),
    passwordInput: document.getElementById('wifiPassword'),
    confirmBtn: document.getElementById('confirmConnectBtn'),
    cancelBtn: document.getElementById('cancelModalBtn'),

    // Функція перемикання статусу
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
            this.wifiList.innerHTML = '';
        }
    },

    // Показати лоадер у списку
    setListLoading(isLoading) {
        if (isLoading) {
            this.wifiList.innerHTML = '<li class="loading">🔍 Сканування мереж...</li>';
        }
    },

    // Оновлення списку мереж
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
            
            // Кнопки генеруємо з data-атрибутами для зручності
            const actionBtn = net.connected 
                ? `<button class="disconnect-btn" data-action="disconnect" data-ssid="${net.ssid}">Відключити</button>`
                : `<button class="secondary-btn" data-action="connect" data-ssid="${net.ssid}" data-secure="${net.secure}">Підключити</button>`;

            li.innerHTML = `
                <div class="network-info">
                    <span class="ssid">${net.ssid} ${lockIcon}</span>
                    <span class="signal">📶 ${net.signal}%</span>
                </div>
                <div>${actionBtn}</div>
            `;
            this.wifiList.appendChild(li);
        });
    },

    // Керування модалкою
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
    
    // Блокування кнопок під час виконання запиту
    setBusy(isBusy, btnElement = null) {
        if (isBusy) {
            if(btnElement) {
                // Зберігаємо старий текст, якщо його ще немає
                if (!btnElement.dataset.originalText) {
                    btnElement.dataset.originalText = btnElement.innerText;
                }
                btnElement.innerText = "⏳...";
                btnElement.disabled = true;
            }
            document.body.style.cursor = "wait";
        } else {
            if(btnElement) {
                btnElement.innerText = btnElement.dataset.originalText || "OK";
                btnElement.disabled = false;
            }
            document.body.style.cursor = "default";
        }
    }
};

// --- MAIN APP LOGIC ---
const app = {
    init() {
        // 1. Кнопка підключення до BLE
        ui.connectBtn.addEventListener('click', () => this.startSession());

        // 2. Кнопка оновлення списку
        ui.refreshBtn.addEventListener('click', () => this.refreshNetworks());

        // 3. Обробка кліків у списку мереж (Event Delegation)
        ui.wifiList.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            
            const { action, ssid, secure } = btn.dataset;
            if (action === 'connect') this.handleConnectClick(ssid, secure === 'true');
            if (action === 'disconnect') this.handleDisconnectClick(ssid);
        });

        // 4. Кнопки модального вікна
        ui.confirmBtn.addEventListener('click', () => this.confirmWifiConnection());
        ui.cancelBtn.addEventListener('click', () => ui.toggleModal(false));
    },

    // Початок роботи: конект до BLE + перше сканування
    async startSession() {
        try {
            ui.setBusy(true, ui.connectBtn);
            await wifiService.connect();
            ui.setConnected(true);
            
            // Чекаємо секунду, щоб канал стабілізувався, і скануємо
            await new Promise(r => setTimeout(r, 1000));
            await this.refreshNetworks();

        } catch (e) {
            console.error(e);
            alert("Помилка Bluetooth: " + e.message);
            ui.setConnected(false);
        } finally {
            ui.setBusy(false, ui.connectBtn);
        }
    },

    // Отримати список мереж
    async refreshNetworks() {
        ui.setListLoading(true);
        try {
            const networks = await wifiService.getAvailableNetworks();
            ui.renderNetworks(networks);
        } catch (e) {
            console.error(e);
            ui.wifiList.innerHTML = `<li class="loading" style="color:red">Помилка: ${e.message}</li>`;
        }
    },

    // Клік по кнопці "Підключити" в списку
    handleConnectClick(ssid, isSecure) {
        selectedSsid = ssid;
        if (isSecure) {
            ui.toggleModal(true, ssid);
        } else {
            // Якщо мережа відкрита
            if (confirm(`Підключитися до відкритої мережі ${ssid}?`)) {
                this.performWifiConnection(ssid, "");
            }
        }
    },

    // Клік по кнопці "Підтвердити" в модалці
    async confirmWifiConnection() {
        const password = ui.passwordInput.value;
        if (!password) {
            alert("Введіть пароль!");
            return;
        }
        await this.performWifiConnection(selectedSsid, password);
    },

    // Реальне надсилання команди підключення
    async performWifiConnection(ssid, password) {
        ui.setBusy(true, ui.confirmBtn); // Блокуємо кнопку в модалці
        try {
            const success = await wifiService.connectToNetwork(ssid, password);
            
            if (success) {
                alert(`Успішно підключено до ${ssid}!`);
                ui.toggleModal(false);
                this.refreshNetworks(); // Оновлюємо список, щоб побачити статус Connected
            } else {
                alert("Не вдалося підключитися. Перевірте пароль.");
            }
        } catch (e) {
            alert("Помилка зв'язку: " + e.message);
        } finally {
            ui.setBusy(false, ui.confirmBtn);
        }
    },

    // Клік по кнопці "Відключити"
    async handleDisconnectClick(ssid) {
        if (!confirm(`Відключитися від ${ssid}?`)) return;
        
        ui.setListLoading(true); // Показуємо, що щось відбувається
        try {
            const success = await wifiService.disconnectFromNetwork(ssid);
            if (success) {
                this.refreshNetworks();
            } else {
                alert("Помилка при відключенні");
                this.refreshNetworks();
            }
        } catch (e) {
            alert(e.message);
        }
    }
};

// Запуск
app.init();
