// Глобальні змінні
let socket;
let grid = [];
let gridWidth = 100;
let gridHeight = 60;
let isConnected = false;

// PWA змінні
let swRegistration = null;
let isPushSubscribed = false;
let vapidPublicKey = null;

// VAPID публічний ключ (згенерувати: npx web-push generate-vapid-keys)
const VAPID_PUBLIC_KEY = 'BGqkXQ2Jz8ZfYx9LmNpQrStUvWxYzA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8S9T0U1V2W3X4Y5Z6';

// Ініціалізація при завантаженні сторінки
document.addEventListener('DOMContentLoaded', () => {
    initializeSocket();
    setupEventListeners();
    initializePWA();
});

// Ініціалізація PWA
async function initializePWA() {
    // Реєстрація Service Worker
    await registerServiceWorker();
    
    // Налаштування push-сповіщень
    await setupPushNotifications();
    
    // Відображення статусу PWA
    updatePWAStatus();
}

// Реєстрація Service Worker
async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        console.log('Service Worker не підтримується');
        updatePWADisplay('Service Worker не підтримується браузером', 'error');
        return false;
    }
    
    try {
        const registration = await navigator.serviceWorker.register('/static/sw.js', {
            scope: '/'
        });
        
        swRegistration = registration;
        console.log('Service Worker зареєстровано:', registration);
        
        // Перевірка оновлень
        registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            console.log('Нова версія Service Worker знайдена');
            
            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    updatePWADisplay('Доступна нова версія. Оновіть сторінку.', 'info');
                    showUpdateNotification();
                }
            });
        });
        
        updatePWADisplay('Service Worker активний', 'success');
        return true;
    } catch (error) {
        console.error('Помилка реєстрації Service Worker:', error);
        updatePWADisplay('Помилка реєстрації Service Worker', 'error');
        return false;
    }
}

// Показ сповіщення про оновлення
function showUpdateNotification() {
    const notification = document.createElement('div');
    notification.className = 'update-notification';
    notification.innerHTML = `
        <span>🔄 Доступна нова версія додатку!</span>
        <button onclick="location.reload()">Оновити</button>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
}

// Налаштування push-сповіщень
async function setupPushNotifications() {
    if (!('Notification' in window)) {
        console.log('Push сповіщення не підтримуються');
        return false;
    }
    
    if (!('PushManager' in window)) {
        console.log('Push Manager не підтримується');
        return false;
    }
    
    if (!swRegistration) {
        console.log('Service Worker не зареєстровано');
        return false;
    }
    
    // Перевіряємо дозвіл на сповіщення
    if (Notification.permission === 'default') {
        requestNotificationPermission();
    } else if (Notification.permission === 'granted') {
        await subscribeToPush();
    }
    
    return isPushSubscribed;
}

// Запит дозволу на сповіщення
async function requestNotificationPermission() {
    const permissionBtn = document.getElementById('request-permission');
    if (permissionBtn) {
        permissionBtn.style.display = 'block';
        permissionBtn.addEventListener('click', async () => {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                await subscribeToPush();
                permissionBtn.style.display = 'none';
                updatePWADisplay('Сповіщення дозволено', 'success');
            } else {
                updatePWADisplay('Сповіщення заборонено', 'warning');
            }
        });
    }
}

// Підписка на push-сповіщення
async function subscribeToPush() {
    if (!swRegistration) return false;
    
    try {
        const subscription = await swRegistration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
        
        console.log('Push підписка отримана:', subscription);
        
        // Відправляємо підписку на сервер
        const response = await fetch('/api/subscribe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(subscription.toJSON())
        });
        
        if (response.ok) {
            isPushSubscribed = true;
            updatePWADisplay('Push сповіщення активовано', 'success');
            return true;
        } else {
            console.error('Помилка збереження підписки');
            return false;
        }
    } catch (error) {
        console.error('Помилка підписки на push:', error);
        updatePWADisplay('Помилка активації push сповіщень', 'error');
        return false;
    }
}

// Відписка від push-сповіщень
async function unsubscribeFromPush() {
    if (!swRegistration || !isPushSubscribed) return false;
    
    try {
        const subscription = await swRegistration.pushManager.getSubscription();
        if (subscription) {
            await subscription.unsubscribe();
            
            // Повідомляємо сервер про відписку
            await fetch('/api/unsubscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(subscription.toJSON())
            });
            
            isPushSubscribed = false;
            updatePWADisplay('Push сповіщення вимкнено', 'info');
            return true;
        }
    } catch (error) {
        console.error('Помилка відписки:', error);
        return false;
    }
}

// Допоміжна функція для перетворення VAPID ключа
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');
    
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// Оновлення відображення статусу PWA
function updatePWAStatus() {
    const pwaStatus = document.getElementById('pwa-status');
    if (!pwaStatus) return;
    
    let statusHtml = '<div style="margin-top: 10px;"><strong>📱 PWA Статус:</strong><br>';
    
    if ('serviceWorker' in navigator) {
        statusHtml += '✅ Service Worker: підтримується<br>';
        if (swRegistration) {
            statusHtml += '✅ Service Worker: зареєстровано<br>';
        }
    } else {
        statusHtml += '❌ Service Worker: не підтримується<br>';
    }
    
    if ('Notification' in window) {
        statusHtml += `✅ Сповіщення: ${Notification.permission === 'granted' ? 'дозволено' : Notification.permission === 'denied' ? 'заборонено' : 'очікує дозволу'}<br>`;
    }
    
    if (isPushSubscribed) {
        statusHtml += '✅ Push сповіщення: активовано<br>';
    }
    
    statusHtml += '</div>';
    pwaStatus.innerHTML = statusHtml;
}

function updatePWADisplay(message, type) {
    const pwaStatus = document.getElementById('pwa-status');
    if (pwaStatus) {
        const color = type === 'success' ? '#48c78e' : type === 'error' ? '#f14668' : type === 'warning' ? '#ffb700' : '#1e3c72';
        pwaStatus.innerHTML += `<div style="color: ${color}; font-size: 0.9em;">ℹ️ ${message}</div>`;
    }
}

// Налаштування Socket.IO
function initializeSocket() {
    socket = io({
        transports: ['websocket'],
        upgrade: false
    });

    socket.on('connect', () => {
        console.log('Підключено до сервера');
        updateStatus('Підключено до сервера', true);
        isConnected = true;
    });

    socket.on('disconnect', () => {
        console.log('Відключено від сервера');
        updateStatus('Відключено від сервера. Спроба перепідключення...', false);
        isConnected = false;
    });

    socket.on('state_init', (data) => {
        console.log('Отримано початковий стан:', data);
        gridWidth = data.width || 100;
        gridHeight = data.height || 60;
        grid = data.grid || [];
        
        updateClientsCount(data.clients_count || 1);
        
        if (data.stats) {
            renderStats(data.stats);
            updateCacheInfo('Статистику отримано з серверного кешу');
        }
        
        renderGrid();
        updateStatus('Сітку завантажено', true);
    });

    socket.on('cell_updated', (data) => {
        const { x, y, state } = data;
        if (y >= 0 && y < grid.length && x >= 0 && x < grid[y].length) {
            grid[y][x] = state;
            updateCellVisual(x, y, state);
        }
    });

    socket.on('stats_updated', (data) => {
        renderStats(data);
        updateCacheInfo('Статистику оновлено з сервера (broadcast)');
    });

    socket.on('stats', (data) => {
        renderStats(data);
        updateCacheInfo('Статистику отримано за запитом з кешу');
    });

    socket.on('error', (data) => {
        console.error('Помилка від сервера:', data);
        updateStatus('Помилка: ' + data.message, false);
    });
}

// Решта функцій renderGrid, handleCellClick, updateCellVisual, renderStats і т.д.
// залишаються без змін з попередньої версії...

function renderGrid() {
    const gridElement = document.getElementById('grid');
    if (!gridElement) return;
    gridElement.innerHTML = '';
    gridElement.style.gridTemplateColumns = `repeat(${gridWidth}, 1fr)`;
    
    for (let y = 0; y < gridHeight; y++) {
        for (let x = 0; x < gridWidth; x++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            if (grid[y] && grid[y][x]) {
                cell.classList.add('active');
            }
            cell.dataset.x = x;
            cell.dataset.y = y;
            cell.addEventListener('click', handleCellClick);
            gridElement.appendChild(cell);
        }
    }
}

function handleCellClick(event) {
    if (!isConnected) {
        updateStatus('Немає підключення до сервера', false);
        return;
    }
    const cell = event.target;
    const x = parseInt(cell.dataset.x);
    const y = parseInt(cell.dataset.y);
    socket.emit('toggle_cell', { x, y });
    cell.classList.add('cell-clicked');
    setTimeout(() => {
        cell.classList.remove('cell-clicked');
    }, 200);
}

function updateCellVisual(x, y, state) {
    const gridElement = document.getElementById('grid');
    if (!gridElement) return;
    const index = y * gridWidth + x;
    const cell = gridElement.children[index];
    if (cell) {
        if (state) {
            cell.classList.add('active');
        } else {
            cell.classList.remove('active');
        }
    }
}

function renderStats(stats) {
    if (!stats) return;
    setTextContent('total-cells', stats.total || 0);
    setTextContent('filled-cells', stats.filled || 0);
    setTextContent('empty-cells', stats.empty || 0);
    setTextContent('fill-percentage', formatPercentage(stats.percentage || 0));
    setTextContent('entropy', formatEntropy(stats.entropy || 0));
    if (stats.timestamp) {
        setTextContent('stats-timestamp', new Date(stats.timestamp).toLocaleTimeString('uk-UA'));
    }
}

function setTextContent(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) element.textContent = value;
}

function formatPercentage(value) {
    return `${Number(value).toFixed(2)}%`;
}

function formatEntropy(value) {
    return Number(value).toFixed(4);
}

function updateStatus(message, isConnected) {
    const statusElement = document.getElementById('status');
    if (statusElement) {
        statusElement.textContent = 'Статус: ' + message;
        statusElement.className = 'status ' + (isConnected ? 'connected' : 'disconnected');
    }
}

function updateClientsCount(count) {
    const countElement = document.getElementById('clients-count');
    if (countElement) countElement.textContent = count;
}

function updateCacheInfo(message) {
    const cacheElement = document.getElementById('cache-status');
    if (cacheElement) {
        const timeStr = new Date().toLocaleTimeString('uk-UA');
        cacheElement.innerHTML = `
            <div>📦 ${message}</div>
            <div>⏱️ Час: ${timeStr}</div>
            <div>🔄 Дані з серверного in-memory кешу</div>
        `;
    }
}

function setupEventListeners() {
    const clearBtn = document.getElementById('clear-grid');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (!isConnected) return;
            socket.emit('clear_grid');
            updateCacheInfo('Ініційовано очищення сітки');
        });
    }
    
    const randomBtn = document.getElementById('fill-random');
    if (randomBtn) {
        randomBtn.addEventListener('click', () => {
            if (!isConnected) return;
            socket.emit('fill_random');
            updateCacheInfo('Ініційовано випадкове заповнення');
        });
    }
    
    const fillAllBtn = document.getElementById('fill-all');
    if (fillAllBtn) {
        fillAllBtn.addEventListener('click', () => {
            if (!isConnected) return;
            for (let y = 0; y < gridHeight; y++) {
                for (let x = 0; x < gridWidth; x++) {
                    if (!grid[y][x]) {
                        socket.emit('toggle_cell', { x, y });
                    }
                }
            }
            updateCacheInfo('Ініційовано заповнення всіх клітинок');
        });
    }
    
    const refreshBtn = document.getElementById('refresh-stats');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            if (isConnected) {
                socket.emit('get_stats');
                updateCacheInfo('Запит оновлення статистики');
            }
        });
    }
}

// Стиль для анімації
const style = document.createElement('style');
style.textContent = `
    .cell-clicked {
        transform: scale(1.3) !important;
        background: linear-gradient(135deg, #ff6b6b, #ff4757) !important;
        transition: all 0.1s ease !important;
    }
    .update-notification {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #1e3c72;
        color: white;
        padding: 15px 20px;
        border-radius: 10px;
        display: flex;
        gap: 15px;
        align-items: center;
        transform: translateX(400px);
        transition: transform 0.3s ease;
        z-index: 1000;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    }
    .update-notification.show {
        transform: translateX(0);
    }
    .update-notification button {
        background: #48c78e;
        border: none;
        padding: 5px 15px;
        border-radius: 5px;
        color: white;
        cursor: pointer;
    }
`;
document.head.appendChild(style);