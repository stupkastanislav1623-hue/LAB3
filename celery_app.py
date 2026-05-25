from celery import Celery
import os
from datetime import datetime
import json
import logging
from typing import Dict, Any
import hashlib

logger = logging.getLogger(__name__)

# Налаштування Celery
REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
celery_app = Celery(
    'collaborative_grid',
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=['celery_app']
)

celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='Europe/Kyiv',
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,
    task_soft_time_limit=3000,
    result_expires=86400,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)

# Словник для зберігання метаданих задач
TASKS_METADATA_FILE = 'tasks_metadata.json'
tasks_metadata: Dict[str, Dict[str, Any]] = {}


def load_tasks_metadata():
    """Завантаження метаданих задач з файлу"""
    global tasks_metadata
    try:
        if os.path.exists(TASKS_METADATA_FILE):
            with open(TASKS_METADATA_FILE, 'r', encoding='utf-8') as f:
                tasks_metadata = json.load(f)
                logger.info(f"📋 Завантажено метадані {len(tasks_metadata)} задач")
        else:
            tasks_metadata = {}
            with open(TASKS_METADATA_FILE, 'w', encoding='utf-8') as f:
                json.dump({}, f)
    except Exception as e:
        logger.error(f"Помилка завантаження метаданих: {e}")
        tasks_metadata = {}


def save_tasks_metadata():
    """Збереження метаданих задач у файл"""
    try:
        with open(TASKS_METADATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(tasks_metadata, f, indent=2, ensure_ascii=False, default=str)
    except Exception as e:
        logger.error(f"Помилка збереження метаданих: {e}")


def get_grid_state_for_export():
    """Отримання поточного стану сітки для експорту"""
    from app import grid_state, GRID_WIDTH, GRID_HEIGHT, compute_grid_stats
    
    return {
        'width': GRID_WIDTH,
        'height': GRID_HEIGHT,
        'grid': [[bool(cell) for cell in row] for row in grid_state],
        'stats': compute_grid_stats()
    }


def compute_export_hash(grid_state_data: Dict) -> str:
    """Обчислення хешу стану сітки для ідемпотентності"""
    grid_str = json.dumps(grid_state_data['grid'], sort_keys=True)
    return hashlib.sha256(grid_str.encode()).hexdigest()[:16]


@celery_app.task(bind=True, name='export_grid_task')
def export_grid_task(self, include_stats: bool = True, include_metadata: bool = True):
    """Фонова задача для експорту стану сітки у JSON файл"""
    task_id = self.request.id
    start_time = datetime.now()
    
    # Оновлюємо метадані задачі
    tasks_metadata[task_id] = {
        'task_id': task_id,
        'status': 'STARTED',
        'started_at': start_time.isoformat(),
        'updated_at': start_time.isoformat(),
        'include_stats': include_stats,
        'include_metadata': include_metadata,
        'progress': 0
    }
    save_tasks_metadata()
    
    try:
        self.update_state(state='STARTED', meta={'progress': 10})
        tasks_metadata[task_id]['progress'] = 10
        save_tasks_metadata()
        
        grid_data = get_grid_state_for_export()
        
        self.update_state(state='STARTED', meta={'progress': 40})
        tasks_metadata[task_id]['progress'] = 40
        save_tasks_metadata()
        
        grid_hash = compute_export_hash(grid_data)
        
        # Перевіряємо чи вже існує експорт з таким самим хешем
        existing_export = None
        for tid, meta in tasks_metadata.items():
            if meta.get('status') == 'SUCCESS' and meta.get('grid_hash') == grid_hash:
                existing_export = meta
                break
        
        if existing_export and existing_export.get('file_path'):
            logger.info(f"Знайдено існуючий експорт для хешу {grid_hash}")
            tasks_metadata[task_id] = {
                **tasks_metadata[task_id],
                'status': 'SUCCESS',
                'completed_at': datetime.now().isoformat(),
                'file_path': existing_export['file_path'],
                'grid_hash': grid_hash,
                'message': 'Експорт отримано з кешу (ідемпотентність)'
            }
            save_tasks_metadata()
            return {
                'task_id': task_id,
                'status': 'SUCCESS',
                'file_path': existing_export['file_path'],
                'grid_hash': grid_hash,
                'cached': True
            }
        
        self.update_state(state='STARTED', meta={'progress': 60})
        tasks_metadata[task_id]['progress'] = 60
        save_tasks_metadata()
        
        export_data = {}
        if include_stats:
            export_data['statistics'] = grid_data['stats']
        
        export_data['grid'] = {
            'width': grid_data['width'],
            'height': grid_data['height'],
            'cells': grid_data['grid']
        }
        
        if include_metadata:
            export_data['metadata'] = {
                'export_task_id': task_id,
                'exported_at': datetime.now().isoformat(),
                'grid_hash': grid_hash,
                'version': '1.0',
                'application': 'Collaborative Grid'
            }
        
        self.update_state(state='STARTED', meta={'progress': 80})
        tasks_metadata[task_id]['progress'] = 80
        save_tasks_metadata()
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"grid_export_{timestamp}_{task_id[:8]}.json"
        os.makedirs('exports', exist_ok=True)
        filepath = os.path.join('exports', filename)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(export_data, f, indent=2, ensure_ascii=False)
        
        self.update_state(state='STARTED', meta={'progress': 95})
        tasks_metadata[task_id]['progress'] = 95
        save_tasks_metadata()
        
        tasks_metadata[task_id].update({
            'status': 'SUCCESS',
            'completed_at': datetime.now().isoformat(),
            'file_path': filepath,
            'file_size': os.path.getsize(filepath),
            'grid_hash': grid_hash,
            'message': 'Експорт успішно створено'
        })
        save_tasks_metadata()
        
        return {
            'task_id': task_id,
            'status': 'SUCCESS',
            'file_path': filepath,
            'file_size': tasks_metadata[task_id]['file_size'],
            'grid_hash': grid_hash,
            'duration': (datetime.now() - start_time).total_seconds(),
            'cached': False
        }
        
    except Exception as e:
        logger.error(f"Помилка виконання задачі експорту: {e}")
        tasks_metadata[task_id].update({
            'status': 'FAILURE',
            'failed_at': datetime.now().isoformat(),
            'error': str(e),
            'message': f'Помилка: {str(e)}'
        })
        save_tasks_metadata()
        raise self.retry(exc=e, countdown=60, max_retries=3)


@celery_app.task(name='cleanup_old_exports')
def cleanup_old_exports_task(days_to_keep: int = 7):
    """Періодична задача для очищення застарілих експортів"""
    logger.info(f"🧹 Запуск очищення експортів старіших за {days_to_keep} днів")
    
    from datetime import timedelta
    cutoff_time = datetime.now() - timedelta(days=days_to_keep)
    deleted_count = 0
    
    for task_id, meta in tasks_metadata.items():
        if meta.get('status') == 'SUCCESS' and meta.get('file_path'):
            completed_at = meta.get('completed_at')
            if completed_at:
                try:
                    completed_dt = datetime.fromisoformat(completed_at)
                    if completed_dt < cutoff_time:
                        filepath = meta['file_path']
                        if os.path.exists(filepath):
                            os.remove(filepath)
                            logger.info(f"🗑️ Видалено файл: {filepath}")
                            deleted_count += 1
                        meta['status'] = 'CLEANED'
                        meta['cleaned_at'] = datetime.now().isoformat()
                except Exception as e:
                    logger.error(f"Помилка при очищенні: {e}")
    
    save_tasks_metadata()
    return {'deleted_count': deleted_count, 'cutoff_date': cutoff_time.isoformat()}


@celery_app.task(name='recalculate_stats')
def recalculate_stats_task():
    """Періодичний перерахунок агрегованої статистики"""
    logger.info("📊 Періодичний перерахунок статистики")
    from app import compute_grid_stats, cache
    new_stats = cache.set('grid_stats', compute_grid_stats())
    logger.info(f"✅ Статистику перераховано: {new_stats}")
    return new_stats


def get_task_metadata(task_id: str) -> Dict:
    """Отримання метаданих задачі за ID"""
    return tasks_metadata.get(task_id, {})


load_tasks_metadata()
