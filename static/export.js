// Модуль для роботи з фоновими експортами
class ExportManager {
    constructor() {
        this.currentTaskId = null;
        this.pollingInterval = null;
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        const startBtn = document.getElementById('start-export');
        if (startBtn) {
            startBtn.addEventListener('click', () => this.startExport());
        }
        
        const checkStatusBtn = document.getElementById('check-status');
        if (checkStatusBtn) {
            checkStatusBtn.addEventListener('click', () => this.checkCurrentStatus());
        }
        
        const listExportsBtn = document.getElementById('list-exports');
        if (listExportsBtn) {
            listExportsBtn.addEventListener('click', () => this.listExports());
        }
    }
    
    async startExport() {
        const includeStats = document.getElementById('include-stats')?.checked ?? true;
        const includeMetadata = document.getElementById('include-metadata')?.checked ?? true;
        
        this.updateExportStatus('Запуск задачі експорту...', 'info');
        this.setLoading(true);
        
        try {
            const response = await fetch('/api/export/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ include_stats: includeStats, include_metadata: includeMetadata })
            });
            
            if (response.status === 202) {
                const data = await response.json();
                this.currentTaskId = data.task_id;
                this.updateExportStatus(`Задача запущена. ID: ${data.task_id}`, 'success');
                this.startPolling(data.task_id);
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('Помилка запуску експорту:', error);
            this.updateExportStatus(`Помилка: ${error.message}`, 'error');
        } finally {
            this.setLoading(false);
        }
    }
    
    startPolling(taskId) {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }
        
        this.pollingInterval = setInterval(async () => {
            await this.checkStatus(taskId);
        }, 2000);
    }
    
    async checkStatus(taskId = this.currentTaskId) {
        if (!taskId) return;
        
        try {
            const response = await fetch(`/api/export/status/${taskId}`);
            const data = await response.json();
            
            this.updateStatusDisplay(data);
            
            if (data.ready) {
                clearInterval(this.pollingInterval);
                this.pollingInterval = null;
                
                if (data.successful && data.result?.file_path) {
                    this.updateExportStatus('Задача завершена успішно!', 'success');
                    this.showDownloadButton(taskId);
                } else if (data.successful === false) {
                    this.updateExportStatus(`Помилка: ${data.error || 'Невідома помилка'}`, 'error');
                }
            }
            
            return data;
        } catch (error) {
            console.error('Помилка перевірки статусу:', error);
            return null;
        }
    }
    
    async checkCurrentStatus() {
        if (!this.currentTaskId) {
            this.updateExportStatus('Немає активної задачі', 'warning');
            return;
        }
        await this.checkStatus(this.currentTaskId);
    }
    
    updateStatusDisplay(data) {
        const statusDiv = document.getElementById('export-task-status');
        if (!statusDiv) return;
        
        const statusMap = {
            'PENDING': '⏳ Очікує виконання',
            'STARTED': '🔄 Виконується...',
            'SUCCESS': '✅ Завершено',
            'FAILURE': '❌ Помилка',
            'RETRY': '🔄 Повторна спроба'
        };
        
        const statusText = statusMap[data.status] || data.status;
        const progress = data.progress || 0;
        
        statusDiv.innerHTML = `
            <div><strong>Статус:</strong> ${statusText}</div>
            <div><strong>Прогрес:</strong> ${progress}%</div>
            <div class="progress-bar-container">
                <div class="progress-bar" style="width: ${progress}%">${progress}%</div>
            </div>
            ${data.metadata?.started_at ? `<div><strong>Початок:</strong> ${new Date(data.metadata.started_at).toLocaleString()}</div>` : ''}
            ${data.metadata?.completed_at ? `<div><strong>Завершення:</strong> ${new Date(data.metadata.completed_at).toLocaleString()}</div>` : ''}
            ${data.metadata?.message ? `<div><strong>Повідомлення:</strong> ${data.metadata.message}</div>` : ''}
        `;
    }
    
    updateExportStatus(message, type) {
        const statusDiv = document.getElementById('export-status');
        if (!statusDiv) return;
        
        const colors = {
            info: '#1e3c72',
            success: '#48c78e',
            error: '#f14668',
            warning: '#ffb700'
        };
        
        statusDiv.innerHTML = `<div style="color: ${colors[type] || colors.info}; padding: 10px;">${message}</div>`;
    }
    
    showDownloadButton(taskId) {
        const container = document.getElementById('export-download-container');
        if (!container) return;
        
        container.innerHTML = `
            <a href="/api/export/download/${taskId}" class="btn btn-success" download>
                ⬇️ Завантажити експорт
            </a>
        `;
    }
    
    setLoading(isLoading) {
        const startBtn = document.getElementById('start-export');
        if (startBtn) {
            startBtn.disabled = isLoading;
            startBtn.textContent = isLoading ? 'Запуск...' : '📤 Запустити експорт';
        }
    }
    
    async listExports() {
        try {
            const response = await fetch('/api/export/list');
            const data = await response.json();
            
            const listDiv = document.getElementById('exports-list');
            if (!listDiv) return;
            
            if (data.exports.length === 0) {
                listDiv.innerHTML = '<div>Немає збережених експортів</div>';
                return;
            }
            
            listDiv.innerHTML = `
                <h4>Збережені експорти (${data.count}):</h4>
                <ul>
                    ${data.exports.map(exp => `
                        <li>
                            ${exp.file_name} 
                            (${new Date(exp.created_at).toLocaleString()}, 
                            ${(exp.file_size / 1024).toFixed(2)} KB)
                            <a href="/api/export/download/${exp.task_id}" class="download-link">Завантажити</a>
                        </li>
                    `).join('')}
                </ul>
            `;
        } catch (error) {
            console.error('Помилка отримання списку експортів:', error);
        }
    }
}

// Ініціалізація при завантаженні сторінки
document.addEventListener('DOMContentLoaded', () => {
    window.exportManager = new ExportManager();
});
