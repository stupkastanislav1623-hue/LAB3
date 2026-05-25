from flask import Flask, render_template, jsonify, request
from flask_socketio import SocketIO, emit
import logging
import random
from threading import Lock
from math import log2
from datetime import datetime
from cache import InMemoryCache
import json
import os

# Налаштування логування
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'collaborative-grid-secret-key'
socketio = SocketIO(app, cors_allowed_origins="*", logger=True, engineio_logger=True)

# Розміри сітки
GRID_WIDTH = 100
GRID_HEIGHT = 60
TOTAL_CELLS = GRID_WIDTH * GRID_HEIGHT

# Зберігання стану сітки в пам'яті процесу
grid_state = [[False for _ in range(GRID_WIDTH)] for _ in range(GRID_HEIGHT)]

# Лічильник підключених клієнтів
connected_clients = 0

# Ініціалізація кешу
cache = InMemoryCache()

# ============ WEB PUSH СПОВІЩЕННЯ ============

# VAPID ключі (згенеруйте свої або використовуйте тестові)
# Для генерації: npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY = "BANuQnAQtPG2p7VeaMs49rjW3Xd4YiN36SCg_QWQEEs_rP8r2nBBwweWCAAqL3J-1gA2BDm6lGgzS1dNZk8a7YM"
VAPID_PRIVATE_KEY = "Qq942qHYm_hxizJX2D3_Jaw1NmYe03mqqMMyoyXuwkY"  # Замініть на ваш приватний ключ

# Сховище push-підписок
PUSH_SUBSCRIPTIONS_FILE = 'push_subscriptions.json'
push_subscriptions = []

def load_subscriptions():
    """Завантаження підписок з файлу"""
    global push_subscriptions
    try:
        if os.path.exists(PUSH_SUBSCRIPTIONS_FILE):
            with open(PUSH_SUBSCRIPTIONS_FILE, 'r', encoding='utf-8') as f:
                push_subscriptions = json.load(f)
                logger.info(f"📋 Завантажено {len(push_subscriptions)} push-підписок з файлу")
        else:
            push_subscriptions = []
            logger.info("📋 Файл з підписками не знайдено, створюємо новий")
            # Створюємо порожній файл
            with open(PUSH_SUBSCRIPTIONS_FILE, 'w', encoding='utf-8') as f:
                json.dump([], f)
    except json.JSONDecodeError:
        push_subscriptions = []
        logger.warning("⚠️ Помилка читання файлу підписок")
    except Exception as e:
        logger.error(f"❌ Помилка завантаження підписок: {e}")
        push_subscriptions = []

def save_subscriptions():
    """Збереження підписок у файл"""
    try:
        with open(PUSH_SUBSCRIPTIONS_FILE, 'w', encoding='utf-8') as f:
            json.dump(push_subscriptions, f, indent=2, ensure_ascii=False)
        logger.info(f"💾 Збережено {len(push_subscriptions)} push-підписок")
    except Exception as e:
        logger.error(f"❌ Помилка збереження підписок: {e}")

def send_push_notification(title: str, body: str, data: dict = None):
    """
    Відправка push-сповіщення всім підписаним клієнтам
    """
    if not push_subscriptions:
        logger.info("📭 Немає активних push-підписок")
        return
    
    try:
        # Перевіряємо наявність pywebpush
        from pywebpush import webpush, WebPushException
        
        notification_data = {
            'title': title,
            'body': body,
            'icon': '/static/icons/icon-192.png',
            'badge': '/static/icons/icon-72.png',
            'vibrate': [200, 100, 200],
            'data': data or {}
        }
        
        to_remove = []
        
        for subscription_info in push_subscriptions:
            try:
                webpush(
                    subscription_info=subscription_info,
                    data=json.dumps(notification_data),
                    vapid_private_key=VAPID_PRIVATE_KEY,
                    vapid_claims={
                        'sub': 'mailto:admin@collaborative-grid.com'
                    }
                )
                logger.info(f"📨 Push-сповіщення відправлено: {title}")
            except WebPushException as e:
                if e.response and e.response.status_code == 410:
                    # Підписка застаріла, видаляємо
                    logger.warning(f"⚠️ Підписка застаріла, видаляємо")
                    to_remove.append(subscription_info)
                else:
                    logger.error(f"❌ Помилка відправки push: {e}")
        
        # Видаляємо застарілі підписки
        for sub in to_remove:
            if sub in push_subscriptions:
                push_subscriptions.remove(sub)
        
        if to_remove:
            save_subscriptions()
            
    except ImportError:
        logger.warning("⚠️ pywebpush не встановлено. Встановіть: pip install pywebpush")
    except Exception as e:
        logger.error(f"❌ Помилка відправки push сповіщення: {e}")

@app.route('/api/vapid-public-key', methods=['GET'])
def get_vapid_public_key():
    """Повертає публічний VAPID ключ для клієнта"""
    return jsonify({'publicKey': VAPID_PUBLIC_KEY})

@app.route('/api/subscribe', methods=['POST'])
def subscribe_push():
    """Збереження push-підписки від клієнта"""
    try:
        subscription = request.get_json()
        
        if not subscription or 'endpoint' not in subscription:
            return jsonify({'error': 'Невірний формат підписки'}), 400
        
        # Перевіряємо чи вже існує така підписка
        exists = any(s.get('endpoint') == subscription['endpoint'] for s in push_subscriptions)
        
        if not exists:
            push_subscriptions.append(subscription)
            save_subscriptions()
            logger.info(f"✅ Додано нову push-підписку. Всього: {len(push_subscriptions)}")
        else:
            logger.info(f"ℹ️ Підписка вже існує")
        
        return jsonify({'status': 'subscribed', 'count': len(push_subscriptions)})
        
    except Exception as e:
        logger.error(f"❌ Помилка збереження підписки: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/unsubscribe', methods=['POST'])
def unsubscribe_push():
    """Видалення push-підписки"""
    try:
        subscription = request.get_json()
        
        if not subscription or 'endpoint' not in subscription:
            return jsonify({'error': 'Невірний формат підписки'}), 400
        
        # Видаляємо підписку
        original_count = len(push_subscriptions)
        push_subscriptions[:] = [s for s in push_subscriptions if s.get('endpoint') != subscription['endpoint']]
        
        if len(push_subscriptions) < original_count:
            save_subscriptions()
            logger.info(f"❌ Видалено push-підписку. Залишилось: {len(push_subscriptions)}")
        else:
            logger.info(f"ℹ️ Підписку не знайдено для видалення")
        
        return jsonify({'status': 'unsubscribed', 'count': len(push_subscriptions)})
        
    except Exception as e:
        logger.error(f"❌ Помилка видалення підписки: {e}")
        return jsonify({'error': str(e)}), 500

def compute_grid_stats():
    """
    Обчислення статистики поля з ентропією Шеннона
    """
    active_cells = 0
    for row in grid_state:
        active_cells += sum(row)
    
    # Логування реального перерахунку
    logger.info(f"🔄 РЕАЛЬНИЙ ПЕРЕРАХУНОК статистики: активних={active_cells}, загалом={TOTAL_CELLS}")
    
    # Обчислення відсотку заповнення
    fill_percentage = (active_cells / TOTAL_CELLS) * 100 if TOTAL_CELLS > 0 else 0
    
    # Обчислення ентропії Шеннона
    entropy = compute_entropy(active_cells, TOTAL_CELLS)
    
    stats = {
        "total": TOTAL_CELLS,
        "filled": active_cells,
        "empty": TOTAL_CELLS - active_cells,
        "percentage": round(fill_percentage, 2),
        "entropy": round(entropy, 4),
        "timestamp": datetime.now().isoformat()
    }
    
    logger.info(f"📊 Статистика: {stats}")
    return stats

def compute_entropy(active: int, total: int) -> float:
    """
    Обчислення ентропії Шеннона для бінарного поля
    """
    if total <= 0:
        return 0.0
    
    p_active = active / total
    p_inactive = 1.0 - p_active
    
    entropy = 0.0
    if p_inactive > 0:
        entropy -= p_inactive * log2(p_inactive)
    if p_active > 0:
        entropy -= p_active * log2(p_active)
    
    return entropy

def validate_coordinates(x, y):
    """
    Валідація координат клітинки
    """
    try:
        x = int(x)
        y = int(y)
        if 0 <= x < GRID_WIDTH and 0 <= y < GRID_HEIGHT:
            return True, x, y
        else:
            return False, None, None
    except (ValueError, TypeError):
        return False, None, None

@app.route('/')
def index():
    """Головна сторінка"""
    return render_template('index.html')

@socketio.on('connect')
def handle_connect():
    """
    Обробник підключення нового клієнта
    """
    global connected_clients
    connected_clients += 1
    client_id = request.sid
    logger.info(f'✅ Клієнт підключився. ID: {client_id}, Всього клієнтів: {connected_clients}')
    
    # Отримуємо статистику з кешу (без перерахунку!)
    stats = cache.get_or_set('grid_stats', compute_grid_stats)
    logger.info(f"📦 Статистика для нового клієнта отримана з кешу: {stats}")
    
    # Відправляємо push-сповіщення іншим клієнтам про нового користувача
    if connected_clients > 1:
        send_push_notification(
            title="Новий користувач! 👋",
            body=f"Користувач приєднався до спільної сітки. Всього: {connected_clients}",
            data={'type': 'user_joined', 'clients': connected_clients}
        )
    
    # Відправляємо повний поточний стан новому клієнту
    emit('state_init', {
        'grid': grid_state,
        'width': GRID_WIDTH,
        'height': GRID_HEIGHT,
        'clients_count': connected_clients,
        'stats': stats
    })

@socketio.on('disconnect')
def handle_disconnect():
    """
    Обробник відключення клієнта
    """
    global connected_clients
    connected_clients -= 1
    logger.info(f'❌ Клієнт відключився. Залишилось клієнтів: {connected_clients}')

@socketio.on('toggle_cell')
def handle_toggle_cell(data):
    """
    Обробник зміни стану клітинки
    """
    try:
        x = data.get('x')
        y = data.get('y')
        
        # Валідація координат
        is_valid, valid_x, valid_y = validate_coordinates(x, y)
        
        if not is_valid:
            logger.warning(f'⚠️ Отримано невалідні координати: x={x}, y={y}')
            emit('error', {'message': 'Невалідні координати клітинки'})
            return
        
        # Змінюємо стан клітинки
        current_state = grid_state[valid_y][valid_x]
        new_state = not current_state
        grid_state[valid_y][valid_x] = new_state
        
        logger.info(f'🖱️ Клітинка змінена: ({valid_x}, {valid_y}) -> {new_state}')
        
        # Транслюємо зміну всім підключеним клієнтам
        emit('cell_updated', {
            'x': valid_x,
            'y': valid_y,
            'state': new_state
        }, broadcast=True)
        
        # Після зміни клітинки перераховуємо статистику
        logger.info("📊 Ініційовано перерахунок статистики після зміни клітинки")
        new_stats = cache.set('grid_stats', compute_grid_stats())
        
        # Розсилаємо оновлену статистику всім клієнтам
        emit('stats_updated', new_stats, broadcast=True)
        logger.info(f"📢 Оновлену статистику розіслано всім клієнтам: {new_stats}")
        
    except Exception as e:
        logger.error(f'❌ Помилка при обробці toggle_cell: {str(e)}')
        emit('error', {'message': 'Внутрішня помилка сервера'})

@socketio.on('get_stats')
def handle_get_stats():
    """
    Відправка статистики клієнту (з кешу)
    """
    stats = cache.get('grid_stats')
    if stats:
        emit('stats', stats)
        logger.info(f"📊 Статистику відправлено за запитом: {stats}")
    else:
        # Якщо статистики немає в кеші (наприклад, після перезапуску)
        new_stats = cache.set('grid_stats', compute_grid_stats())
        emit('stats', new_stats)

@socketio.on('clear_grid')
def handle_clear_grid():
    """
    Очищення всієї сітки
    """
    global grid_state
    logger.info("🧹 Очищення сітки")
    
    # Очищаємо сітку
    for y in range(GRID_HEIGHT):
        for x in range(GRID_WIDTH):
            if grid_state[y][x]:
                grid_state[y][x] = False
                emit('cell_updated', {'x': x, 'y': y, 'state': False}, broadcast=True)
    
    # Оновлюємо статистику
    new_stats = cache.set('grid_stats', compute_grid_stats())
    emit('stats_updated', new_stats, broadcast=True)
    logger.info(f"✅ Сітку очищено, статистику оновлено: {new_stats}")

@socketio.on('fill_random')
def handle_fill_random():
    """
    Випадкове заповнення сітки (30% клітинок)
    """
    logger.info("🎲 Випадкове заповнення сітки")
    
    # Випадково змінюємо 30% клітинок
    for y in range(GRID_HEIGHT):
        for x in range(GRID_WIDTH):
            if random.random() < 0.3:  # 30% ймовірність
                new_state = random.choice([True, False])
                if grid_state[y][x] != new_state:
                    grid_state[y][x] = new_state
                    emit('cell_updated', {'x': x, 'y': y, 'state': new_state}, broadcast=True)
    
    # Оновлюємо статистику
    new_stats = cache.set('grid_stats', compute_grid_stats())
    emit('stats_updated', new_stats, broadcast=True)
    logger.info(f"✅ Випадкове заповнення завершено, статистику оновлено: {new_stats}")

if __name__ == '__main__':
    # Завантажуємо збережені push-підписки
    load_subscriptions()
    
    logger.info('=' * 50)
    logger.info('🚀 Запуск Collaborative Grid сервера з PWA та push-сповіщеннями')
    logger.info(f'📐 Розмір сітки: {GRID_WIDTH}x{GRID_HEIGHT} (всього {TOTAL_CELLS} клітинок)')
    logger.info(f'🌐 Доступ за адресою: http://localhost:5000')
    logger.info(f'🔔 Push сповіщення: {"активні" if VAPID_PRIVATE_KEY != "YOUR_PRIVATE_KEY_HERE" else "не налаштовані (вставте VAPID ключі)"}')
    
    # Ініціалізація кешу під час старту
    logger.info("🔄 Ініціалізація кешу статистики...")
    initial_stats = cache.set('grid_stats', compute_grid_stats())
    logger.info(f"✅ Кеш ініціалізовано: {initial_stats}")
    logger.info('=' * 50)
    
    socketio.run(app, debug=True, allow_unsafe_werkzeug=True)