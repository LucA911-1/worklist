/**
 * 工作清单 - 任务列表渲染
 */
const TaskList = (function () {
    let currentFilter = 'all';

    /**
     * 初始化
     */
    function init() {
        // 筛选标签
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                currentFilter = tab.dataset.filter;
                render();
            });
        });

        render();
    }

    /**
     * 渲染任务列表
     */
    function render() {
        const listEl = document.getElementById('taskList');
        const emptyEl = document.getElementById('emptyState');

        let tasks = Store.getTasksByType(currentFilter);

        // 排序：未完成在前，按日期升序
        tasks.sort((a, b) => {
            if (a.status !== b.status) {
                return a.status === 'pending' ? -1 : 1;
            }
            const dateA = a.date || '9999-12-31';
            const dateB = b.date || '9999-12-31';
            if (dateA !== dateB) return dateA.localeCompare(dateB);
            if (a.time && b.time) return a.time.localeCompare(b.time);
            return 0;
        });

        // 更新统计
        updateStats();

        if (tasks.length === 0) {
            listEl.innerHTML = '';
            emptyEl.style.display = 'flex';
            return;
        }

        emptyEl.style.display = 'none';
        listEl.innerHTML = tasks.map(task => renderTaskCard(task)).join('');

        // 绑定事件
        bindCardEvents(listEl);
    }

    /**
     * 渲染单个任务卡片
     */
    function renderTaskCard(task, compact) {
        const isCompleted = task.status === 'completed';
        const typeLabel = task.type === 'recurring' ? '重复' : '一次';
        const typeClass = task.type === 'recurring' ? 'task-tag--recurring' : 'task-tag--once';
        const typeIcon = task.type === 'recurring' ? '🔄' : '📌';

        let dateLabel = '';
        if (task.type === 'recurring') {
            dateLabel = TaskParser.getTaskDescription(task).split(' ').filter(p => !p.includes(':')).join(' ');
        } else if (task.date) {
            const today = TaskParser.formatDate(new Date());
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = TaskParser.formatDate(tomorrow);

            if (task.date === today) {
                dateLabel = '今天';
            } else if (task.date === tomorrowStr) {
                dateLabel = '明天';
            } else {
                const d = new Date(task.date + 'T00:00:00');
                dateLabel = `${d.getMonth() + 1}/${d.getDate()}`;
            }

            // 检查是否过期
            if (task.status === 'pending' && task.date < today) {
                dateLabel = '已过期 ' + dateLabel;
            }
        }

        const timeLabel = task.time || '';
        const isOverdue = task.status === 'pending' && task.date && task.date < TaskParser.formatDate(new Date());

        let metaHtml = `<span class="task-tag ${typeClass}">${typeIcon} ${typeLabel}</span>`;
        if (dateLabel) {
            metaHtml += `<span class="task-tag ${isOverdue ? 'task-tag--overdue' : 'task-tag--date'}">${dateLabel}</span>`;
        }
        if (timeLabel) {
            metaHtml += `<span class="task-tag task-tag--time">⏰ ${timeLabel}</span>`;
        }

        const creatorHtml = task.createdBy
            ? `<div class="task-creator">由 ${task.createdBy}${task.updatedBy && task.updatedBy !== task.createdBy ? ' · ' + task.updatedBy + '修改' : ''}</div>`
            : '';

        return `
            <div class="task-card ${isCompleted ? 'completed' : ''}" data-id="${task.id}">
                <div class="task-checkbox ${isCompleted ? 'checked' : ''}" data-action="toggle"></div>
                <div class="task-body" data-action="detail">
                    <div class="task-title">${escapeHtml(task.title)}</div>
                    <div class="task-meta">${metaHtml}</div>
                    ${compact ? '' : creatorHtml}
                </div>
            </div>
        `;
    }

    /**
     * 绑定卡片事件
     */
    function bindCardEvents(container) {
        container.querySelectorAll('.task-card').forEach(card => {
            const id = card.dataset.id;

            // 点击复选框
            const checkbox = card.querySelector('[data-action="toggle"]');
            if (checkbox) {
                checkbox.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleToggle(id);
                });
            }

            // 点击卡片打开详情
            const body = card.querySelector('[data-action="detail"]');
            if (body) {
                body.addEventListener('click', () => {
                    openDetail(id);
                });
            }
        });
    }

    /**
     * 处理完成切换
     */
    function handleToggle(id) {
        Store.toggleTask(id);
        // 尝试同步
        const task = Store.getAllTasks().find(t => t.id === id);
        if (task) {
            Sync.updateTask(task);
        }
    }

    /**
     * 打开任务详情
     */
    function openDetail(id) {
        const task = Store.getAllTasks().find(t => t.id === id);
        if (!task) return;

        const modal = document.getElementById('taskDetailModal');
        const content = document.getElementById('taskDetailContent');

        const typeText = task.type === 'recurring' ? '重复性工作' : '一次性工作';
        const recurrenceText = task.type === 'recurring' ? TaskParser.getTaskDescription(task).split(' ').filter(p => !p.includes(':')).join(' ') : '';
        const statusText = task.status === 'completed' ? '已完成' : '待办';
        const statusColor = task.status === 'completed' ? 'var(--success)' : 'var(--warning)';

        content.innerHTML = `
            <div class="detail-title">${escapeHtml(task.title)}</div>
            <div class="detail-row">
                <span class="detail-label">类型</span>
                <span class="detail-value">${typeText}</span>
            </div>
            ${task.type === 'recurring' ? `
            <div class="detail-row">
                <span class="detail-label">重复</span>
                <span class="detail-value">${recurrenceText}</span>
            </div>` : ''}
            <div class="detail-row">
                <span class="detail-label">日期</span>
                <span class="detail-value">${task.date || '未设置'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">时间</span>
                <span class="detail-value">${task.time || '未设置'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">状态</span>
                <span class="detail-value" style="color: ${statusColor}; font-weight: 500;">${statusText}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">创建者</span>
                <span class="detail-value">${task.createdBy || '未知'}</span>
            </div>
            ${task.updatedBy ? `
            <div class="detail-row">
                <span class="detail-label">修改者</span>
                <span class="detail-value">${task.updatedBy}</span>
            </div>` : ''}
            <div class="detail-row">
                <span class="detail-label">创建于</span>
                <span class="detail-value">${formatDateTime(task.createdAt)}</span>
            </div>

            <div class="detail-edit-area" id="editArea" style="display:none;">
                <div class="edit-label">标题</div>
                <input type="text" id="editTitle" value="${escapeHtml(task.title)}">
                <div class="edit-label">日期</div>
                <input type="date" id="editDate" value="${task.date || ''}">
                <div class="edit-label">时间</div>
                <input type="time" id="editTime" value="${task.time || ''}">
                <div class="edit-label">类型</div>
                <select id="editType">
                    <option value="once" ${task.type === 'once' ? 'selected' : ''}>一次性</option>
                    <option value="recurring" ${task.type === 'recurring' ? 'selected' : ''}>重复性</option>
                </select>
                <div class="edit-label">重复频率</div>
                <select id="editRecurrence" ${task.type !== 'recurring' ? 'disabled' : ''}>
                    <option value="daily" ${task.recurrencePattern === 'daily' ? 'selected' : ''}>每天</option>
                    <option value="weekly" ${task.recurrencePattern === 'weekly' ? 'selected' : ''}>每周</option>
                    <option value="monthly" ${task.recurrencePattern === 'monthly' ? 'selected' : ''}>每月</option>
                    <option value="yearly" ${task.recurrencePattern === 'yearly' ? 'selected' : ''}>每年</option>
                </select>
            </div>

            <div class="detail-actions">
                <button class="btn btn--primary" id="detailToggleBtn">
                    ${task.status === 'pending' ? '标记完成' : '取消完成'}
                </button>
                <button class="btn btn--secondary" id="detailEditBtn">编辑</button>
                <button class="btn btn--danger" id="detailDeleteBtn">删除</button>
            </div>
        `;

        modal.classList.add('active');

        // 绑定事件
        document.getElementById('detailToggleBtn').addEventListener('click', () => {
            Store.toggleTask(id);
            const updated = Store.getAllTasks().find(t => t.id === id);
            if (updated) Sync.updateTask(updated);
            closeModal();
            render();
        });

        document.getElementById('detailEditBtn').addEventListener('click', () => {
            const editArea = document.getElementById('editArea');
            const editBtn = document.getElementById('detailEditBtn');
            if (editArea.style.display === 'none') {
                editArea.style.display = 'block';
                editBtn.textContent = '保存';
            } else {
                // 保存
                const updates = {
                    title: document.getElementById('editTitle').value,
                    date: document.getElementById('editDate').value || null,
                    time: document.getElementById('editTime').value || null,
                    type: document.getElementById('editType').value,
                    recurrencePattern: document.getElementById('editType').value === 'recurring'
                        ? document.getElementById('editRecurrence').value
                        : null
                };
                Store.updateTask(id, updates);
                const updated = Store.getAllTasks().find(t => t.id === id);
                if (updated) Sync.updateTask(updated);
                closeModal();
                render();
            }
        });

        document.getElementById('detailDeleteBtn').addEventListener('click', () => {
            if (confirm('确定删除这个任务吗？')) {
                Store.deleteTask(id);
                Sync.deleteTask(id);
                closeModal();
                render();
            }
        });

        // 类型切换时启用/禁用重复频率
        document.getElementById('editType').addEventListener('change', (e) => {
            const recurrenceSelect = document.getElementById('editRecurrence');
            recurrenceSelect.disabled = e.target.value !== 'recurring';
        });
    }

    /**
     * 关闭弹窗
     */
    function closeModal() {
        document.getElementById('taskDetailModal').classList.remove('active');
    }

    /**
     * 更新统计
     */
    function updateStats() {
        const stats = Store.getStats();
        document.getElementById('totalCount').textContent = stats.total;
        document.getElementById('doneCount').textContent = stats.done;
        document.getElementById('pendingCount').textContent = stats.pending;
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

    /**
     * 刷新
     */
    function refresh() {
        render();
    }

    return {
        init,
        render,
        refresh,
        renderTaskCard,
        bindCardEvents
    };
})();
