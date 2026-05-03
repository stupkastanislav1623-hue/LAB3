from threading import Lock
import logging
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)

class InMemoryCache:
    """
    Уніфікований API для in-memory кешу з thread-safe операціями
    """
    
    def __init__(self) -> None:
        self._values = {}
        self._lock = Lock()
        logger.info("📦 Ініціалізовано InMemoryCache")
    
    def get(self, key: str, default: Any = None) -> Any:
        """
        Отримання значення з кешу
        """
        with self._lock:
            value = self._values.get(key, default)
            logger.debug(f"🔍 GET {key}: {'знайдено' if key in self._values else 'не знайдено, повертаємо default'}")
            return value
    
    def set(self, key: str, value: Any) -> Any:
        """
        Встановлення значення в кеш
        """
        with self._lock:
            self._values[key] = value
            logger.debug(f"💾 SET {key}: значення збережено")
            return value
    
    def delete(self, key: str) -> bool:
        """
        Видалення значення з кешу
        """
        with self._lock:
            if key in self._values:
                del self._values[key]
                logger.debug(f"🗑️ DELETE {key}: видалено")
                return True
            logger.debug(f"❌ DELETE {key}: ключ не знайдено")
            return False
    
    def clear(self) -> None:
        """
        Очищення всього кешу
        """
        with self._lock:
            self._values.clear()
            logger.info("🧹 Кеш повністю очищено")
    
    def get_or_set(self, key: str, factory: Callable[[], Any]) -> Any:
        """
        Отримання значення з кешу або його створення через factory функцію
        """
        with self._lock:
            if key not in self._values:
                logger.info(f"🆕 Ключ {key} не знайдено в кеші, створюємо нове значення через factory")
                self._values[key] = factory()
            else:
                logger.debug(f"✅ Ключ {key} знайдено в кеші, повертаємо збережене значення")
            return self._values[key]
    
    def exists(self, key: str) -> bool:
        """
        Перевірка наявності ключа в кеші
        """
        with self._lock:
            return key in self._values
    
    def get_all(self) -> dict:
        """
        Отримання всього вмісту кешу (копія для безпеки)
        """
        with self._lock:
            return self._values.copy()
    
    def get_stats(self) -> dict:
        """
        Отримання статистики кешу
        """
        with self._lock:
            return {
                "size": len(self._values),
                "keys": list(self._values.keys()),
                "memory_estimate": sum(len(str(v)) for v in self._values.values())
            }