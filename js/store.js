/**
 * 工作清单 - 数据存储
 * 管理 localStorage 持久化 + 事件通知
 */
const Store = (function () {
    const STORAGE_KEY = 'worklist_tasks';
    const SETTINGS_KEY = 'worklist_settings';

    let tasks = [];
    let listeners = [];
    let settings = {
        userName: '',
        userId: '',
        apiUrl: '',
        lastSync: null
    };

    /**
     * 初始化
     */
    function init() {
        loadSettings();
        loadTasks();
        if (!settings.userId) {
            settings.userId = 'user_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
            saveSettings();
        }
    }

    /**
     * 加载任务
     */
    function loadTasks() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            tasks = data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('加载任务失败:', e);
            tasks = [];
        }
    }

    /**
     * 保存任务
     */
    function saveTasks() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
        } catch (e) {
            console.error('保存任务失败:', e);
        }
    }

    /**
     * 加载设置
     */
    function loadSettings() {
        try {
            const data = localStorage.getItem(SETTINGS_KEY);
            if (data) {
                settings = Object.assign(settings, JSON.parse(data));
            }
        } catch (e) {
            console.error('加载设置失败:', e);
        }
    }

    /**
     * 保存设置
     */
    function saveSettings() {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        } catch (e) {
            console.error('保存设置失败:', e);
        }
    }

    /**
     * 获取所有任务
     */
    function getAllTasks() {
        return [...tasks];
    }

    /**
     * 获取指定日期的任务（包括重复性任务）
     */
    function getTasksForDate(dateStr) {
        return tasks.filter(task => {
            if (task.status === 'completed' && task.type === 'once') {
                return task.date === dateStr;
            }
            return TaskParser.shouldRunOnDate(task, dateStr);
        });
    }

    /**
     * 获取今日任务
     */
    function getTodayTasks() {
        const today = TaskParser.formatDate(new Date());
        return getTasksForDate(today);
    }

    /**
     * 按类型获取任务
     */
    function getTasksByType(type) {
        if (type === 'all') return getAllTasks();
        if (type === 'today') return getTodayTasks();
        return tasks.filter(t => t.type === type);
    }

    /**
     * 添加任务
     */
    function addTask(task) {
        task.createdBy = settings.userName || '匿名';
        task.updatedBy = settings.userName || '匿名';
        task.updatedAt = new Date().toISOString();
        tasks.push(task);
        saveTasks();
        notify('add', task);
        return task;
    }

    /**
     * 批量添加任务
     */
    function addTasks(newTasks) {
        newTasks.forEach(task => {
            task.createdBy = settings.userName || '匿名';
            task.updatedBy = settings.userName || '匿名';
            task.updatedAt = new Date().toISOString();
            tasks.push(task);
        });
        saveTasks();
        notify('batchAdd', newTasks);
        return newTasks;
    }

    /**
     * 更新任务
     */
    function updateTask(id, updates) {
        const index = tasks.findIndex(t => t.id === id);
        if (index === -1) return null;

        tasks[index] = Object.assign(tasks[index], updates, {
            updatedAt: new Date().toISOString(),
            updatedBy: settings.userName || '匿名'
        });
        saveTasks();
        notify('update', tasks[index]);
        return tasks[index];
    }

    /**
     * 切换任务完成状态
     */
    function toggleTask(id) {
        const task = tasks.find(t => t.id === id);
        if (!task) return null;

        if (task.status === 'pending') {
            task.status = 'completed';
            task.completedAt = new Date().toISOString();
        } else {
            task.status = 'pending';
            task.completedAt = null;
        }
        task.updatedAt = new Date().toISOString();
        task.updatedBy = settings.userName || '匿名';

        saveTasks();
        notify('toggle', task);
        return task;
    }

    /**
     * 删除任务
     */
    function deleteTask(id) {
        const index = tasks.findIndex(t => t.id === id);
        if (index === -1) return false;

        const removed = tasks.splice(index, 1)[0];
        saveTasks();
        notify('delete', removed);
        return true;
    }

    /**
     * 用云端数据替换本地数据
     */
    function replaceAll(remoteTasks) {
        tasks = remoteTasks;
        saveTasks();
        notify('sync', tasks);
    }

    /**
     * 合并云端数据（解决冲突）
     */
    function mergeRemoteTasks(remoteTasks) {
        let changed = false;

        remoteTasks.forEach(remote => {
            const localIndex = tasks.findIndex(t => t.id === remote.id);
            if (localIndex === -1) {
                // 本地不存在，添加
                tasks.push(remote);
                changed = true;
            } else {
                // 比较更新时间
                const localTask = tasks[localIndex];
                const localTime = new Date(localTask.updatedAt || 0).getTime();
                const remoteTime = new Date(remote.updatedAt || 0).getTime();
                if (remoteTime > localTime) {
                    tasks[localIndex] = remote;
                    changed = true;
                }
            }
        });

        if (changed) {
            saveTasks();
            notify('sync', tasks);
        }
        return changed;
    }

    /**
     * 获取设置
     */
    function getSettings() {
        return { ...settings };
    }

    /**
     * 更新设置
     */
    function updateSettings(updates) {
        settings = Object.assign(settings, updates);
        saveSettings();
        notify('settings', settings);
        return settings;
    }

    /**
     * 清空所有数据
     */
    function clearAll() {
        tasks = [];
        saveTasks();
        notify('clear', null);
    }

    /**
     * 导出数据
     */
    function exportData() {
        return {
            tasks: tasks,
            settings: { ...settings, userId: undefined },
            exportTime: new Date().toISOString(),
            version: '1.0'
        };
    }

    /**
     * 获取统计信息
     */
    function getStats() {
        const total = tasks.length;
        const done = tasks.filter(t => t.status === 'completed').length;
        const pending = total - done;
        return { total, done, pending };
    }

    /**
     * 获取参与协作的用户列表
     */
    function getCollaborators() {
        const users = new Set();
        tasks.forEach(t => {
            if (t.createdBy) users.add(t.createdBy);
            if (t.updatedBy) users.add(t.updatedBy);
        });
        return Array.from(users);
    }

    /**
     * 监听数据变化
     */
    function on(callback) {
        listeners.push(callback);
    }

    /**
     * 取消监听
     */
    function off(callback) {
        listeners = listeners.filter(l => l !== callback);
    }

    /**
     * 通知监听器
     */
    function notify(event, data) {
        listeners.forEach(cb => cb(event, data));
    }

    return {
        init,
        getAllTasks,
        getTasksForDate,
        getTodayTasks,
        getTasksByType,
        addTask,
        addTasks,
        updateTask,
        toggleTask,
        deleteTask,
        replaceAll,
        mergeRemoteTasks,
        getSettings,
        updateSettings,
        clearAll,
        exportData,
        getStats,
        getCollaborators,
        on,
        off
    };
})();
