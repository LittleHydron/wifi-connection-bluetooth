// --- КОНФІГУРАЦІЯ UUID ---
// (Ці ж самі UUID мають бути в Python скрипті на Raspberry)
const SERVICE_UUID           = '00000001-710e-4a5b-8d75-3e5b444bc3cf';
const CHAR_NETWORKS_UUID     = '00000002-710e-4a5b-8d75-3e5b444bc3cf'; // RPi -> Phone (List)
const CHAR_CONFIG_UUID       = '00000003-710e-4a5b-8d75-3e5b444bc3cf'; // Phone -> RPi (Config)
const CHAR_STATUS_UUID       = '00000004-710e-4a5b-8d75-3e5b444bc3cf'; // RPi -> Phone (Status)

let bluetoothDevice;
let gattServer;
let configCharacteristic;
let networksCharacteristic;

// --- ЛОГІКА BLUETOOTH ---

async function initializeBluetooth() {
    // Безпекова перевірка браузера
    if (!navigator.bluetooth) {
        alert("Web Bluetooth недоступний!\nПереконайтесь, що ви використовуєте:\n- Chrome/Edge (Android/PC)\n- Bluefy (iOS)\nТа відкрили сайт через HTTPS.");
        return;
    }

    try {
        console.log('Requesting Bluetooth Device...');
        bluetoothDevice = await navigator.bluetooth.requestDevice({
            filters: [{ services: [SERVICE_UUID] }] 
        });

        bluetoothDevice.addEventListener('gattserverdisconnected', onDisconnected);

        document.getElementById('status-msg').innerText = "Підключення до Bluetooth...";
        
        gattServer = await bluetoothDevice.gatt.connect();
        console.log('Connected to GATT Server');

        const service = await gattServer.getPrimaryService(SERVICE_UUID);

        configCharacteristic = await service.getCharacteristic(CHAR_CONFIG_UUID);
        networksCharacteristic = await service.getCharacteristic(CHAR_NETWORKS_UUID);

        // Перемикаємо UI
        document.getElementById('bt-connect-screen').style.display = 'none';
        document.getElementById('wifi-screen').style.display = 'block';

        // Запитуємо список мереж
        await requestWifiList();

    } catch (error) {
        console.error('BT Error: ' + error);
        // Ігноруємо помилку, якщо користувач просто натиснув "Скасувати"
        if (error.name !== 'NotFoundError' && error.message !== 'User cancelled the requestDevice() chooser.') {
            alert('Помилка підключення: ' + error.message);
        }
    }
}

async function requestWifiList() {
    document.getElementById('status-msg').innerText = "Отримання списку мереж...";
    const container = document.getElementById("networks");
    container.innerHTML = '<div style="text-align:center; padding:20px;">Завантаження...</div>';

    try {
        const value = await networksCharacteristic.readValue();
        const decoder = new TextDecoder('utf-8');
        const jsonString = decoder.decode(value);
        
        const networks = JSON.parse(jsonString);
        renderNetworks(networks);
        document.getElementById('status-msg').innerText = "";
        
    } catch (error) {
        console.error('Error reading networks:', error);
        document.getElementById('status-msg').innerText = "Не вдалося отримати список. Спробуйте ще раз.";
    }
}

// --- ВІДОБРАЖЕННЯ (UI) ---

function renderNetworks(networks) {
    const container = document.getElementById("networks");
    container.innerHTML = "";
    
    if (networks.length === 0) {
        container.innerHTML = "<div style='text-align:center'>Мереж не знайдено</div>";
        return;
    }

    networks.forEach(net => {
        const div = document.createElement("div");
        div.className = "network";
        
        let lockIcon = net.secure ? '<span class="secure">🔒</span>' : '';
        let signalStrength = `<span class='badge signal'>${net.signal}%</span>`;
        
        if (net.connected) {
            signalStrength = `<span class='badge connected'>Підключено</span>`;
        }

        div.innerHTML = `
            <div style="font-weight:bold;">${lockIcon} ${net.ssid}</div>
            <div>${signalStrength}</div>
        `;
        
        div.onclick = () => showDialog(net.ssid, net.secure);
        container.appendChild(div);
    });
}

function showDialog(ssid, secure) {
    document.getElementById("modal-ssid").textContent = ssid;
    document.getElementById("ssid-input").value = ssid;
    document.getElementById("password-input").value = ""; 
    
    const passwordGroup = document.getElementById("password-group");
    passwordGroup.style.display = secure ? "block" : "none";
    
    document.getElementById("connectModal").style.display = "block";
}

function closeModal() {
    document.getElementById("connectModal").style.display = "none";
}

// --- ВІДПРАВКА ДАНИХ (WRITE) ---

async function sendCredentials() {
    const ssid = document.getElementById("ssid-input").value;
    const password = document.getElementById("password-input").value;
    
    const data = {
        ssid: ssid,
        psk: password
    };
    
    try {
        document.getElementById('connect-btn').innerText = "Надсилання...";
        
        const encoder = new TextEncoder();
        const bytes = encoder.encode(JSON.stringify(data));
        
        await configCharacteristic.writeValue(bytes);
        
        alert("Дані відправлено на Raspberry Pi! Вона спробує підключитися.");
        closeModal();
        document.getElementById('connect-btn').innerText = "Підключитись";

    } catch (error) {
        console.error('Error writing credentials:', error);
        alert("Помилка відправки: " + error.message);
    }
}

function onDisconnected(event) {
    alert("Bluetooth з'єднання втрачено!");
    document.getElementById('bt-connect-screen').style.display = 'block';
    document.getElementById('wifi-screen').style.display = 'none';
}
