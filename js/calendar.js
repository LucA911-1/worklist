/**
 * 工作清单 - 日历组件
 */
const Calendar = (function () {
    let currentDate = new Date();
    let selectedDate = TaskParser.formatDate(new Date());

    /**
     * 初始化
     */
    function init() {
        document.getElementById('prevMonth').addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() - 1);
            render();
        });

        document.getElementById('nextMonth').addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            render();
        });

        render();
    }

    /**
     * 渲染日历
     */
    function render() {
        renderHeader();
        renderGrid();
        renderSelectedDateTasks();
    }

    /**
     * 渲染标题
     */
    function renderHeader() {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth() + 1;
        document.getElementById('calTitle').textContent = `${year}年${month}月`;
    }

    /**
     * 渲染日期网格
     */
    function renderGrid() {
        const grid = document.getElementById('calendarGrid');
        grid.innerHTML = '';

        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();

        // 获取当月第一天
        const firstDay = new Date(year, month, 1);
        const firstDayOfWeek = firstDay.getDay();

        // 获取当月天数
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // 获取上个月天数（用于填充前面的空位）
        const prevMonthDays = new Date(year, month, 0).getDate();

        const todayStr = TaskParser.formatDate(new Date());

        // 生成42个格子（6行7列）
        for (let i = 0; i < 42; i++) {
            const cell = document.createElement('div');
            cell.className = 'cal-day';

            let dayNum, dateObj, dateStr;

            if (i < firstDayOfWeek) {
                // 上个月
                dayNum = prevMonthDays - firstDayOfWeek + i + 1;
                dateObj = new Date(year, month - 1, dayNum);
                cell.classList.add('cal-day--other-month');
            } else if (i >= firstDayOfWeek + daysInMonth) {
                // 下个月
                dayNum = i - firstDayOfWeek - daysInMonth + 1;
                dateObj = new Date(year, month + 1, dayNum);
                cell.classList.add('cal-day--other-month');
            } else {
                // 当月
                dayNum = i - firstDayOfWeek + 1;
                dateObj = new Date(year, month, dayNum);
            }

            dateStr = TaskParser.formatDate(dateObj);
            cell.textContent = dayNum;
            cell.dataset.date = dateStr;

            // 今天
            if (dateStr === todayStr) {
                cell.classList.add('cal-day--today');
            }

            // 选中
            if (dateStr === selectedDate) {
                cell.classList.add('cal-day--selected');
            }

            // 有任务的日期
            const tasks = Store.getTasksForDate(dateStr);
            if (tasks.length > 0) {
                cell.classList.add('cal-day--has-tasks');
            }

            cell.addEventListener('click', () => {
                selectedDate = dateStr;
                render();
            });

            grid.appendChild(cell);
        }
    }

    /**
     * 渲染选中日期的任务
     */
    function renderSelectedDateTasks() {
        const titleEl = document.getElementById('calTasksTitle');
        const listEl = document.getElementById('calTasksList');

        const date = new Date(selectedDate + 'T00:00:00');
        const today = new Date();
        const todayStr = TaskParser.formatDate(today);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = TaskParser.formatDate(tomorrow);

        let titleText;
        if (selectedDate === todayStr) {
            titleText = '今日工作';
        } else if (selectedDate === tomorrowStr) {
            titleText = '明日工作';
        } else {
            titleText = `${date.getMonth() + 1}月${date.getDate()}日工作`;
        }
        titleEl.textContent = titleText;

        const tasks = Store.getTasksForDate(selectedDate);

        if (tasks.length === 0) {
            listEl.innerHTML = '<div class="cal-tasks-empty">这一天没有工作安排</div>';
            return;
        }

        // 按时间排序
        tasks.sort((a, b) => {
            if (!a.time && !b.time) return 0;
            if (!a.time) return 1;
            if (!b.time) return -1;
            return a.time.localeCompare(b.time);
        });

        listEl.innerHTML = tasks.map(task => TaskList.renderTaskCard(task, true)).join('');

        // 绑定事件
        TaskList.bindCardEvents(listEl);
    }

    /**
     * 跳转到指定日期
     */
    function goToMonth(year, month) {
        currentDate = new Date(year, month, 1);
        render();
    }

    /**
     * 选中今天
     */
    function selectToday() {
        selectedDate = TaskParser.formatDate(new Date());
        currentDate = new Date();
        render();
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
        goToMonth,
        selectToday
    };
})();
