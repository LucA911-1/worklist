/**
 * 工作清单 - 智能解析器
 * 将自然语言输入解析为结构化任务
 */
const TaskParser = (function () {

    // 星期映射
    const WEEKDAY_MAP = {
        '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0,
        '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 0
    };

    /**
     * 解析单行文本为任务对象
     */
    function parseLine(text) {
        text = text.trim();
        if (!text) return null;

        const task = {
            id: generateId(),
            title: '',
            type: 'once',
            recurrencePattern: null,
            recurrenceDays: null,
            recurrenceDayOfMonth: null,
            date: null,
            time: null,
            priority: 'medium',
            status: 'pending',
            completedAt: null,
            createdAt: new Date().toISOString(),
            createdBy: null,
            updatedAt: new Date().toISOString(),
            updatedBy: null
        };

        let remaining = text;

        // 1. 检测重复性
        const recurringResult = detectRecurring(remaining);
        if (recurringResult) {
            task.type = 'recurring';
            task.recurrencePattern = recurringResult.pattern;
            task.recurrenceDays = recurringResult.days;
            task.recurrenceDayOfMonth = recurringResult.dayOfMonth;
            remaining = recurringResult.remaining;
        }

        // 2. 检测日期
        const dateResult = detectDate(remaining, task.type);
        if (dateResult) {
            task.date = dateResult.date;
            remaining = dateResult.remaining;
        } else if (task.type === 'once') {
            // 一次性任务默认今天
            task.date = formatDate(new Date());
        }

        // 3. 检测时间
        const timeResult = detectTime(remaining);
        if (timeResult) {
            task.time = timeResult.time;
            remaining = timeResult.remaining;
        }

        // 4. 检测优先级
        const priorityResult = detectPriority(remaining);
        if (priorityResult) {
            task.priority = priorityResult.priority;
            remaining = priorityResult.remaining;
        }

        // 5. 剩余文本作为标题
        task.title = cleanTitle(remaining);

        // 如果标题为空，用原始文本
        if (!task.title) {
            task.title = text;
        }

        return task;
    }

    /**
     * 解析多行文本为任务数组
     */
    function parseMultiple(text) {
        const lines = text.split('\n').filter(l => l.trim());
        return lines.map(parseLine).filter(t => t !== null);
    }

    /**
     * 检测重复性模式
     */
    function detectRecurring(text) {
        let pattern = null;
        let days = null;
        let dayOfMonth = null;
        let remaining = text;

        // 每天 / 每日
        if (/每[天日]/.test(text)) {
            pattern = 'daily';
            remaining = remaining.replace(/每[天日]/, '');
        }
        // 工作日
        else if (/工作日|平日/.test(text)) {
            pattern = 'weekly';
            days = [1, 2, 3, 4, 5];
            remaining = remaining.replace(/工作日|平日/, '');
        }
        // 周末
        else if (/周末/.test(text)) {
            pattern = 'weekly';
            days = [0, 6];
            remaining = remaining.replace(/周末/, '');
        }
        // 每周X / 每星期X
        else if (/每[周星期]/.test(text)) {
            pattern = 'weekly';
            // 匹配 "每周一周三周五" 或 "每周一和周三" 或 "每周一、三、五"
            const dayMatches = text.match(/[周星期]([一二三四五六日天])/g);
            if (dayMatches && dayMatches.length > 0) {
                days = dayMatches.map(m => WEEKDAY_MAP[m.replace(/[周星期]/, '')]).filter(d => d !== undefined);
            }
            // 如果没有匹配到具体星期，尝试匹配数字
            if (!days || days.length === 0) {
                const numMatches = text.match(/[周星期](\d)/g);
                if (numMatches) {
                    days = numMatches.map(m => WEEKDAY_MAP[m.replace(/[周星期]/, '')]).filter(d => d !== undefined);
                }
            }
            // 默认本周一
            if (!days || days.length === 0) {
                days = [1];
            }
            remaining = remaining.replace(/每[周星期]/, '');
            remaining = remaining.replace(/(?:周|星期)[一二三四五六日天\d]/g, '');
            remaining = remaining.replace(/^[一二三四五六日天\d和、\s]+/, '');
        }
        // 每月X号 / 每月X日
        else if (/每月/.test(text)) {
            pattern = 'monthly';
            const dayMatch = text.match(/每月(\d{1,2})[号日]/);
            if (dayMatch) {
                dayOfMonth = parseInt(dayMatch[1]);
                remaining = remaining.replace(/每月\d{1,2}[号日]/, '');
            } else {
                dayOfMonth = 1;
                remaining = remaining.replace(/每月/, '');
            }
        }
        // 每年
        else if (/每年/.test(text)) {
            pattern = 'yearly';
            remaining = remaining.replace(/每年/, '');
        }

        if (!pattern) return null;

        return { pattern, days, dayOfMonth, remaining };
    }

    /**
     * 检测日期
     */
    function detectDate(text, taskType) {
        const now = new Date();
        let date = null;
        let remaining = text;

        // 今天
        if (/今天|今日|今天/.test(text)) {
            date = formatDate(now);
            remaining = remaining.replace(/今天|今日/g, '');
        }
        // 明天
        else if (/明天|明日/.test(text)) {
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            date = formatDate(tomorrow);
            remaining = remaining.replace(/明天|明日/g, '');
        }
        // 后天
        else if (/后天/.test(text)) {
            const dayAfter = new Date(now);
            dayAfter.setDate(dayAfter.getDate() + 2);
            date = formatDate(dayAfter);
            remaining = remaining.replace(/后天/g, '');
        }
        // 大后天
        else if (/大后天/.test(text)) {
            const dayAfter = new Date(now);
            dayAfter.setDate(dayAfter.getDate() + 3);
            date = formatDate(dayAfter);
            remaining = remaining.replace(/大后天/g, '');
        }
        // 下周X
        else if (/下周[一二三四五六日天]/.test(text)) {
            const match = text.match(/下周([一二三四五六日天])/);
            if (match) {
                const targetDay = WEEKDAY_MAP[match[1]];
                const result = getNextWeekday(now, targetDay, true);
                date = formatDate(result);
                remaining = remaining.replace(/下周[一二三四五六日天]/, '');
            }
        }
        // 这周X / 本周X
        else if (/(?:这周|本周)[一二三四五六日天]/.test(text)) {
            const match = text.match(/(?:这周|本周)([一二三四五六日天])/);
            if (match) {
                const targetDay = WEEKDAY_MAP[match[1]];
                const result = getNextWeekday(now, targetDay, false);
                date = formatDate(result);
                remaining = remaining.replace(/(?:这周|本周)[一二三四五六日天]/, '');
            }
        }
        // 周X / 星期X (本周)
        else if (/周[一二三四五六日天]|星期[一二三四五六日天]/.test(text)) {
            const match = text.match(/周([一二三四五六日天])|星期([一二三四五六日天])/);
            if (match) {
                const dayChar = match[1] || match[2];
                const targetDay = WEEKDAY_MAP[dayChar];
                const result = getNextWeekday(now, targetDay, false);
                date = formatDate(result);
                remaining = remaining.replace(/周[一二三四五六日天]|星期[一二三四五六日天]/, '');
            }
        }
        // 下个月X号
        else if (/下个月(\d{1,2})[号日]/.test(text)) {
            const match = text.match(/下个月(\d{1,2})[号日]/);
            if (match) {
                const day = parseInt(match[1]);
                const result = new Date(now.getFullYear(), now.getMonth() + 1, day);
                date = formatDate(result);
                remaining = remaining.replace(/下个月\d{1,2}[号日]/, '');
            }
        }
        // X月X号 / X月X日
        else if (/(\d{1,2})月(\d{1,2})[号日]/.test(text)) {
            const match = text.match(/(\d{1,2})月(\d{1,2})[号日]/);
            if (match) {
                const month = parseInt(match[1]);
                const day = parseInt(match[2]);
                let year = now.getFullYear();
                if (month < now.getMonth() + 1) year++;
                const result = new Date(year, month - 1, day);
                date = formatDate(result);
                remaining = remaining.replace(/\d{1,2}月\d{1,2}[号日]/, '');
            }
        }
        // X号 / X日 (本月)
        else if (/(?:^|[^\d])(\d{1,2})[号日](?!\d)/.test(text)) {
            const match = text.match(/(\d{1,2})[号日]/);
            if (match) {
                const day = parseInt(match[1]);
                if (day >= 1 && day <= 31) {
                    let result = new Date(now.getFullYear(), now.getMonth(), day);
                    // 如果已过，设为下月
                    if (result < now && taskType !== 'recurring') {
                        result = new Date(now.getFullYear(), now.getMonth() + 1, day);
                    }
                    date = formatDate(result);
                    remaining = remaining.replace(/\d{1,2}[号日]/, '');
                }
            }
        }

        if (!date) return null;
        return { date, remaining };
    }

    /**
     * 检测时间
     */
    function detectTime(text) {
        let time = null;
        let remaining = text;

        // 上午X点 / 早上X点
        const morningMatch = text.match(/(?:上午|早上|早晨|早)(\d{1,2})[点时](?::?(\d{1,2}))?/);
        if (morningMatch) {
            const hour = parseInt(morningMatch[1]);
            const minute = morningMatch[2] ? parseInt(morningMatch[2]) : 0;
            if (hour >= 0 && hour <= 12) {
                time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
                remaining = remaining.replace(/(?:上午|早上|早晨|早)\d{1,2}[点时]:?\d{0,2}/, '');
            }
        }

        // 下午X点 / 下午X点半
        if (!time) {
            const afternoonMatch = text.match(/(?:下午|午后|晚)(\d{1,2})[点时](?::?(\d{1,2}))?(半)?/);
            if (afternoonMatch) {
                let hour = parseInt(afternoonMatch[1]);
                const minute = afternoonMatch[3] ? 30 : (afternoonMatch[2] ? parseInt(afternoonMatch[2]) : 0);
                if (hour >= 1 && hour <= 11) hour += 12;
                else if (hour === 12) hour = 12;
                time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
                remaining = remaining.replace(/(?:下午|午后|晚)\d{1,2}[点时]:?\d{0,2}半?/, '');
            }
        }

        // X点X分 / X点 / X:X
        if (!time) {
            const timeMatch = text.match(/(\d{1,2})[点时](?::(\d{1,2}))?(?::?(\d{1,2}))?(分)?/);
            if (timeMatch) {
                const hour = parseInt(timeMatch[1]);
                const minute = timeMatch[2] ? parseInt(timeMatch[2]) : (timeMatch[3] ? parseInt(timeMatch[3]) : 0);
                if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
                    time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
                    remaining = remaining.replace(/\d{1,2}[点时]:?\d{0,2}分?/, '');
                }
            }
        }

        if (!time) return null;
        return { time, remaining };
    }

    /**
     * 检测优先级
     */
    function detectPriority(text) {
        if (/紧急|重要|立刻|马上|尽快|加急/.test(text)) {
            return {
                priority: 'high',
                remaining: text.replace(/紧急|重要|立刻|马上|尽快|加急/g, '')
            };
        }
        if (/不急|有空|慢慢|以后/.test(text)) {
            return {
                priority: 'low',
                remaining: text.replace(/不急|有空|慢慢|以后/g, '')
            };
        }
        return null;
    }

    /**
     * 获取下一个星期几的日期
     */
    function getNextWeekday(fromDate, targetDay, nextWeek) {
        const result = new Date(fromDate);
        const currentDay = result.getDay();
        let diff = targetDay - currentDay;

        if (nextWeek) {
            diff += 7;
        } else if (diff <= 0) {
            diff += 7;
        }

        result.setDate(result.getDate() + diff);
        return result;
    }

    /**
     * 格式化日期为 YYYY-MM-DD
     */
    function formatDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    /**
     * 清理标题文本
     */
    function cleanTitle(text) {
        return text
            .replace(/[，,。.!！？?]/g, '')
            .replace(/\s+/g, ' ')
            .replace(/^[\s、和]+|[\s、和]+$/g, '')
            .trim();
    }

    /**
     * 生成唯一ID
     */
    function generateId() {
        return 'task_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * 获取任务的可读描述
     */
    function getTaskDescription(task) {
        const parts = [];

        if (task.type === 'recurring') {
            if (task.recurrencePattern === 'daily') {
                parts.push('每天');
            } else if (task.recurrencePattern === 'weekly' && task.recurrenceDays) {
                const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
                parts.push('每周' + task.recurrenceDays.map(d => dayNames[d]).join('、'));
            } else if (task.recurrencePattern === 'monthly') {
                parts.push(`每月${task.recurrenceDayOfMonth}号`);
            } else if (task.recurrencePattern === 'yearly') {
                parts.push('每年');
            }
        } else if (task.date) {
            parts.push(task.date);
        }

        if (task.time) {
            parts.push(task.time);
        }

        return parts.join(' ');
    }

    /**
     * 检查重复性任务在指定日期是否应该执行
     */
    function shouldRunOnDate(task, dateStr) {
        if (task.type !== 'recurring') {
            return task.date === dateStr;
        }

        const date = new Date(dateStr + 'T00:00:00');
        const dayOfWeek = date.getDay();
        const dayOfMonth = date.getDate();

        switch (task.recurrencePattern) {
            case 'daily':
                return true;
            case 'weekly':
                return task.recurrenceDays && task.recurrenceDays.includes(dayOfWeek);
            case 'monthly':
                return task.recurrenceDayOfMonth === dayOfMonth;
            case 'yearly':
                return true; // 简化处理
            default:
                return false;
        }
    }

    return {
        parseLine,
        parseMultiple,
        getTaskDescription,
        shouldRunOnDate,
        generateId,
        formatDate
    };
})();
