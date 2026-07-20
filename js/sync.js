/**
 * 工作清单 - 云端同步
 * 通过腾讯云 EdgeOne 边缘函数实现多人协作
 */
const Sync = (function () {
    let isOnline = navigator.onLine;
    let isSyncing = false;
    let autoSyncTimer = null;
    let listeners = [];

    const AUTO_SYNC_INTERVAL = 30000; // 30秒自动同步

    /**
     * 初始化
     */
    function init() {
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        updateOnlineStatus();

        // 如果配置了API地址，启动自动同步
        const settings = Store.getSettings();
        if (settings.apiUrl) {
            startAutoSync();
        }
    }

    /**
     * 处理上线
     */
    function handleOnline() {
        isOnline = true;
        updateOnlineStatus();
        showToast('网络已恢复');
        sync();
    }

    /**
     * 处理离线
     */
    function handleOffline() {
        isOnline = false;
        updateOnlineStatus();
        showToast('已离线，数据将保存在本地');
    }

    /**
     * 更新在线状态显示
     */
    function updateOnlineStatus() {
        const statusEl = document.getElementById('syncStatus');
        if (!statusEl) return;

        const dot = statusEl.querySelector('.sync-dot');
        const text = statusEl.querySelector('.sync-text');

        if (isSyncing) {
            dot.className = 'sync-dot sync-dot--syncing';
            text.textContent = '同步中';
        } else if (isOnline) {
            const settings = Store.getSettings();
            if (settings.apiUrl) {
                dot.className = 'sync-dot sync-dot--online';
                text.textContent = '已连接';
            } else {
                dot.className = 'sync-dot sync-dot--offline';
                text.textContent = '本地模式';
            }
        } else {
            dot.className = 'sync-dot sync-dot--offline';
            text.textContent = '离线';
        }
    }

    /**
     * 获取API基础URL
     */
    function getApiUrl() {
        const settings = Store.getSettings();
        if (!settings.apiUrl) return null;
        return settings.apiUrl.replace(/\/+$/, '');
    }

    /**
     * 获取请求头
     */
    function getHeaders() {
        const settings = Store.getSettings();
        return {
            'Content-Type': 'application/json',
            'X-User-Id': settings.userId || 'anonymous',
            'X-User-Name': encodeURIComponent(settings.userName || '匿名')
        };
    }

    /**
     * 同步（双向）
     */
    async function sync() {
        const apiUrl = getApiUrl();
        if (!apiUrl || !isOnline) {
            log('跳过同步：未配置云端地址或离线');
            return false;
        }

        if (isSyncing) {
            log('同步进行中，跳过');
            return false;
        }

        isSyncing = true;
        updateOnlineStatus();
        log('开始同步...');

        try {
            // 1. 拉取云端数据
            const remoteTasks = await fetchTasks();
            log(`拉取到 ${remoteTasks.length} 条云端任务`);

            // 2. 合并到本地
            const localChanged = Store.mergeRemoteTasks(remoteTasks);

            // 3. 推送本地数据
            const localTasks = Store.getAllTasks();
            await pushTasks(localTasks);
            log(`推送 ${localTasks.length} 条本地任务`);

            // 4. 更新同步时间
            Store.updateSettings({ lastSync: new Date().toISOString() });

            log('同步完成');
            notify('synced', { remote: remoteTasks.length, local: localTasks.length });
            return true;
        } catch (error) {
            log('同步失败: ' + error.message, 'error');
            notify('error', error);
            return false;
        } finally {
            isSyncing = false;
            updateOnlineStatus();
        }
    }

    /**
     * 仅拉取云端数据
     */
    async function pull() {
        const apiUrl = getApiUrl();
        if (!apiUrl || !isOnline) {
            showToast('无法同步：离线或未配置云端地址');
            return false;
        }

        isSyncing = true;
        updateOnlineStatus();
        log('拉取云端数据...');

        try {
            const remoteTasks = await fetchTasks();
            log(`拉取到 ${remoteTasks.length} 条云端任务`);
            Store.mergeRemoteTasks(remoteTasks);
            Store.updateSettings({ lastSync: new Date().toISOString() });
            log('拉取完成');
            showToast('拉取成功');
            return true;
        } catch (error) {
            log('拉取失败: ' + error.message, 'error');
            showToast('拉取失败: ' + error.message);
            return false;
        } finally {
            isSyncing = false;
            updateOnlineStatus();
        }
    }

    /**
     * 仅推送本地数据
     */
    async function push() {
        const apiUrl = getApiUrl();
        if (!apiUrl || !isOnline) {
            showToast('无法同步：离线或未配置云端地址');
            return false;
        }

        isSyncing = true;
        updateOnlineStatus();
        log('推送本地数据...');

        try {
            const localTasks = Store.getAllTasks();
            await pushTasks(localTasks);
            log(`推送 ${localTasks.length} 条任务`);
            Store.updateSettings({ lastSync: new Date().toISOString() });
            log('推送完成');
            showToast('推送成功');
            return true;
        } catch (error) {
            log('推送失败: ' + error.message, 'error');
            showToast('推送失败: ' + error.message);
            return false;
        } finally {
            isSyncing = false;
            updateOnlineStatus();
        }
    }

    /**
     * 从云端获取任务
     */
    async function fetchTasks() {
        const apiUrl = getApiUrl();
        const response = await fetch(`${apiUrl}/api/tasks`, {
            method: 'GET',
            headers: getHeaders()
        });

        if (!response.ok) {
            throw new Error(`服务器返回 ${response.status}`);
        }

        const data = await response.json();
        return data.tasks || [];
    }

    /**
     * 推送任务到云端
     */
    async function pushTasks(tasks) {
        const apiUrl = getApiUrl();
        const response = await fetch(`${apiUrl}/api/tasks`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ tasks: tasks })
        });

        if (!response.ok) {
            throw new Error(`服务器返回 ${response.status}`);
        }

        return await response.json();
    }

    /**
     * 创建单个任务到云端
     */
    async function createTask(task) {
        const apiUrl = getApiUrl();
        if (!apiUrl || !isOnline) return null;

        try {
            const response = await fetch(`${apiUrl}/api/tasks`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ tasks: [task] })
            });
            return response.ok;
        } catch (error) {
            log('创建任务失败: ' + error.message, 'error');
            return false;
        }
    }

    /**
     * 更新云端任务
     */
    async function updateTask(task) {
        const apiUrl = getApiUrl();
        if (!apiUrl || !isOnline) return false;

        try {
            const response = await fetch(`${apiUrl}/api/tasks`, {
                method: 'PUT',
                headers: getHeaders(),
                body: JSON.stringify(task)
            });
            return response.ok;
        } catch (error) {
            log('更新任务失败: ' + error.message, 'error');
            return false;
        }
    }

    /**
     * 删除云端任务
     */
    async function deleteTask(taskId) {
        const apiUrl = getApiUrl();
        if (!apiUrl || !isOnline) return false;

        try {
            const response = await fetch(`${apiUrl}/api/tasks?id=${taskId}`, {
                method: 'DELETE',
                headers: getHeaders()
            });
            return response.ok;
        } catch (error) {
            log('删除任务失败: ' + error.message, 'error');
            return false;
        }
    }

    /**
     * 启动自动同步
     */
    function startAutoSync() {
        stopAutoSync();
        autoSyncTimer = setInterval(() => {
            if (isOnline && getApiUrl()) {
                sync();
            }
        }, AUTO_SYNC_INTERVAL);
        log('自动同步已启动（每30秒）');
    }

    /**
     * 停止自动同步
     */
    function stopAutoSync() {
        if (autoSyncTimer) {
            clearInterval(autoSyncTimer);
            autoSyncTimer = null;
        }
    }

    /**
     * 检查是否在线
     */
    function getIsOnline() {
        return isOnline;
    }

    /**
     * 检查是否正在同步
     */
    function getIsSyncing() {
        return isSyncing;
    }

    /**
     * 添加日志
     */
    function log(message, level) {
        const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        const entry = { time, message, level: level || 'info' };
        notify('log', entry);
        console.log(`[Sync] ${time} ${message}`);
    }

    /**
     * 显示Toast
     */
    function showToast(message) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => {
            toast.classList.remove('show');
        }, 2500);
    }

    /**
     * 监听事件
     */
    function on(callback) {
        listeners.push(callback);
    }

    /**
     * 通知监听器
     */
    function notify(event, data) {
        listeners.forEach(cb => cb(event, data));
    }

    return {
        init,
        sync,
        pull,
        push,
        createTask,
        updateTask,
        deleteTask,
        startAutoSync,
        stopAutoSync,
        getIsOnline,
        getIsSyncing,
        on
    };
})();
