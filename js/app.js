/**
 * 工作清单 - 主应用
 */
const App = (function () {

    /**
     * 初始化应用
     */
    function init() {
        Store.init();
        Sync.init();
        TaskList.init();
        Calendar.init();
        bindEvents();
        updateUserInfo();
        checkFirstVisit();

        // 监听数据变化
        Store.on((event, data) => {
            TaskList.refresh();
            Calendar.refresh();
        });

        // 监听同步日志
        Sync.on((event, data) => {
            if (event === 'log') {
                appendSyncLog(data);
            }
            if (event === 'synced') {
                showToast(`同步成功：云端${data.remote}条，本地${data.local}条`);
            }
        });
    }

    /**
     * 绑定全局事件
     */
    function bindEvents() {
        // 底部导航
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const view = item.dataset.view;
                if (view === 'sync') {
                    openSyncModal();
                    return;
                }
                if (view === 'settings') {
                    openSettingsModal();
                    return;
                }
                switchView(view);
            });
        });

        // 点击弹窗遮罩关闭
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.classList.remove('active');
                }
            });
        });

        // 智能识别按钮
        document.getElementById('parseBtn').addEventListener('click', handleParse);

        // 添加任务按钮
        document.getElementById('addTaskBtn').addEventListener('click', handleAddTasks);

        // 快捷模板
        document.querySelectorAll('.template-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const input = document.getElementById('workInput');
                const template = btn.dataset.template;
                if (input.value.trim()) {
                    input.value += '\n' + template;
                } else {
                    input.value = template;
                }
                handleParse();
            });
        });

        // 用户按钮
        document.getElementById('userBtn').addEventListener('click', () => {
            openSettingsModal();
        });

        // 设置保存
        document.getElementById('saveSettingsBtn').addEventListener('click', handleSaveSettings);

        // 导出数据
        document.getElementById('exportBtn').addEventListener('click', handleExport);

        // 清空数据
        document.getElementById('clearBtn').addEventListener('click', handleClear);

        // 同步按钮
        document.getElementById('syncNowBtn').addEventListener('click', () => {
            Sync.sync().then(() => updateSyncModal());
        });
        document.getElementById('syncPullBtn').addEventListener('click', () => {
            Sync.pull().then(() => updateSyncModal());
        });
        document.getElementById('syncPushBtn').addEventListener('click', () => {
            Sync.push().then(() => updateSyncModal());
        });
    }

    /**
     * 切换视图
     */
    function switchView(viewName) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

        const viewMap = {
            list: { view: 'viewList', nav: '[data-view="list"]' },
            calendar: { view: 'viewCalendar', nav: '[data-view="calendar"]' },
            add: { view: 'viewAdd', nav: '[data-view="add"]' }
        };

        const config = viewMap[viewName];
        if (config) {
            document.getElementById(config.view).classList.add('active');
            document.querySelector(config.nav).classList.add('active');

            if (viewName === 'list') {
                TaskList.refresh();
            } else if (viewName === 'calendar') {
                Calendar.refresh();
            }
        }

        // 滚动到顶部
        document.getElementById('mainContent').scrollTop = 0;
    }

    /**
     * 处理智能识别
     */
    function handleParse() {
        const input = document.getElementById('workInput');
        const text = input.value.trim();

        if (!text) {
            showToast('请输入工作内容');
            return;
        }

        const tasks = TaskParser.parseMultiple(text);
        if (tasks.length === 0) {
            showToast('未能识别出有效工作');
            return;
        }

        // 显示预览
        const previewEl = document.getElementById('parsePreview');
        const listEl = document.getElementById('previewList');
        previewEl.style.display = 'block';

        listEl.innerHTML = tasks.map(task => {
            const typeIcon = task.type === 'recurring' ? '🔄' : '📌';
            const typeText = task.type === 'recurring' ? '重复性' : '一次性';
            const desc = TaskParser.getTaskDescription(task);

            return `
                <div class="preview-item">
                    <span class="preview-icon">${typeIcon}</span>
                    <div class="preview-info">
                        <div class="preview-name">${escapeHtml(task.title)}</div>
                        <div class="preview-detail">${typeText} · ${desc || '未设置日期'}</div>
                    </div>
                </div>
            `;
        }).join('');

        showToast(`识别到 ${tasks.length} 项工作`);
    }

    /**
     * 处理添加任务
     */
    function handleAddTasks() {
        const input = document.getElementById('workInput');
        const text = input.value.trim();

        if (!text) {
            showToast('请输入工作内容');
            return;
        }

        const tasks = TaskParser.parseMultiple(text);
        if (tasks.length === 0) {
            showToast('未能识别出有效工作');
            return;
        }

        Store.addTasks(tasks);

        // 尝试同步到云端
        tasks.forEach(task => {
            Sync.createTask(task);
        });

        // 清空输入
        input.value = '';
        document.getElementById('parsePreview').style.display = 'none';

        showToast(`已添加 ${tasks.length} 项工作到清单`);

        // 切换到清单视图
        switchView('list');
    }

    /**
     * 打开设置弹窗
     */
    function openSettingsModal() {
        const settings = Store.getSettings();
        document.getElementById('userNameInput').value = settings.userName || '';
        document.getElementById('apiUrlInput').value = settings.apiUrl || '';
        document.getElementById('settingsModal').classList.add('active');
    }

    /**
     * 保存设置
     */
    function handleSaveSettings() {
        const userName = document.getElementById('userNameInput').value.trim();
        const apiUrl = document.getElementById('apiUrlInput').value.trim().replace(/\/+$/, '');

        Store.updateSettings({ userName, apiUrl });

        if (apiUrl) {
            Sync.startAutoSync();
            showToast('设置已保存，云端同步已启用');
            // 尝试立即同步
            setTimeout(() => Sync.sync(), 500);
        } else {
            Sync.stopAutoSync();
            showToast('设置已保存，本地模式');
        }

        updateUserInfo();
        document.getElementById('settingsModal').classList.remove('active');
    }

    /**
     * 更新用户信息显示
     */
    function updateUserInfo() {
        const settings = Store.getSettings();
        const avatar = document.getElementById('userAvatar');
        if (settings.userName) {
            avatar.textContent = settings.userName.charAt(0).toUpperCase();
        } else {
            avatar.textContent = '?';
        }
    }

    /**
     * 打开同步面板
     */
    function openSyncModal() {
        updateSyncModal();
        document.getElementById('syncModal').classList.add('active');
    }

    /**
     * 更新同步面板信息
     */
    function updateSyncModal() {
        const settings = Store.getSettings();
        const stats = Store.getStats();
        const collaborators = Store.getCollaborators();

        const isOnline = Sync.getIsOnline();
        const isSyncing = Sync.getIsSyncing();

        let statusText;
        if (isSyncing) {
            statusText = '同步中...';
        } else if (!settings.apiUrl) {
            statusText = '未配置云端';
        } else if (isOnline) {
            statusText = '已连接';
        } else {
            statusText = '离线';
        }

        document.getElementById('syncInfoStatus').textContent = statusText;
        document.getElementById('syncInfoTime').textContent = settings.lastSync
            ? formatDateTime(settings.lastSync)
            : '从未';
        document.getElementById('syncInfoLocal').textContent = stats.total;
        document.getElementById('syncInfoRemote').textContent = '—';
        document.getElementById('syncInfoUsers').textContent = collaborators.length;
    }

    /**
     * 追加同步日志
     */
    function appendSyncLog(entry) {
        const logEl = document.getElementById('syncLog');
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        logEntry.innerHTML = `<span class="log-time">${entry.time}</span>${entry.message}`;
        logEl.insertBefore(logEntry, logEl.firstChild);

        // 限制日志条数
        while (logEl.children.length > 50) {
            logEl.removeChild(logEl.lastChild);
        }
    }

    /**
     * 处理导出
     */
    function handleExport() {
        const data = Store.exportData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `worklist_${TaskParser.formatDate(new Date())}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('数据已导出');
    }

    /**
     * 处理清空
     */
    function handleClear() {
        if (confirm('确定清空所有本地数据吗？此操作不可撤销！')) {
            Store.clearAll();
            showToast('本地数据已清空');
        }
    }

    /**
     * 检查首次访问
     */
    function checkFirstVisit() {
        const settings = Store.getSettings();
        if (!settings.userName) {
            setTimeout(() => {
                openSettingsModal();
                showToast('请先设置你的名字');
            }, 500);
        }

        // 如果没有任务，添加示例任务
        if (Store.getAllTasks().length === 0) {
            const sampleTasks = [
                TaskParser.parseLine('每天早上9点开早会'),
                TaskParser.parseLine('每周五下午5点写周报'),
                TaskParser.parseLine('明天上午10点客户会议'),
                TaskParser.parseLine('每月1号核对账目')
            ].filter(t => t !== null);

            if (sampleTasks.length > 0) {
                Store.addTasks(sampleTasks);
            }
        }
    }

    /**
     * 显示Toast
     */
    function showToast(message) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => {
            toast.classList.remove('show');
        }, 2500);
    }

    /**
     * HTML转义
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    /**
     * 格式化日期时间
     */
    function formatDateTime(isoStr) {
        if (!isoStr) return '';
        const d = new Date(isoStr);
        return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    return { init };
})();

// 启动应用
document.addEventListener('DOMContentLoaded', App.init);
