/**
 * 工作清单 - EdgeOne 边缘函数
 * 提供任务 CRUD API，基于 KV 存储实现多人协作
 *
 * 路由：/api/tasks
 * 方法：GET / POST / PUT / DELETE
 *
 * 部署说明：
 * 1. 在 EdgeOne 控制台创建 KV 命名空间 "worklist_kv"
 * 2. 将该函数部署到 EdgeOne Pages 的 functions/api/ 目录
 * 3. 在函数详情页绑定 KV 命名空间，变量名设为 WORKLIST_KV
 */

const KV_NAMESPACE = 'WORKLIST_KV';
const TASKS_KEY = 'all_tasks';
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-User-Id, X-User-Name',
    'Content-Type': 'application/json; charset=UTF-8'
};

/**
 * 主处理函数
 */
export async function onRequest({ request, env }) {
    // 处理 CORS 预检
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: CORS_HEADERS });
    }

    try {
        const kv = env[KV_NAMESPACE];
        if (!kv) {
            return jsonResponse({ error: 'KV存储未绑定，请在EdgeOne控制台绑定KV命名空间' }, 500);
        }

        switch (request.method) {
            case 'GET':
                return await handleGet(kv);
            case 'POST':
                return await handlePost(request, kv);
            case 'PUT':
                return await handlePut(request, kv);
            case 'DELETE':
                return await handleDelete(request, kv);
            default:
                return jsonResponse({ error: '不支持的请求方法' }, 405);
        }
    } catch (error) {
        return jsonResponse({ error: error.message }, 500);
    }
}

/**
 * GET - 获取所有任务
 */
async function handleGet(kv) {
    const data = await kv.get(TASKS_KEY, 'json');
    const tasks = data || [];

    return jsonResponse({
        success: true,
        tasks: tasks,
        count: tasks.length,
        serverTime: new Date().toISOString()
    });
}

/**
 * POST - 创建/批量创建任务
 * 请求体：{ tasks: [task1, task2, ...] }
 */
async function handlePost(request, kv) {
    const body = await request.json();
    const newTasks = body.tasks || [];

    if (!Array.isArray(newTasks) || newTasks.length === 0) {
        return jsonResponse({ error: '请提供任务数据' }, 400);
    }

    // 获取用户信息
    const userId = request.headers.get('X-User-Id') || 'anonymous';
    const userName = decodeURIComponent(request.headers.get('X-User-Name') || '匿名');

    // 读取现有任务
    const data = await kv.get(TASKS_KEY, 'json');
    const tasks = data || [];

    // 添加新任务
    const now = new Date().toISOString();
    newTasks.forEach(task => {
        if (!task.id) {
            task.id = 'task_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
        }
        task.createdBy = task.createdBy || userName;
        task.updatedBy = userName;
        task.updatedAt = now;
        if (!task.createdAt) {
            task.createdAt = now;
        }
        tasks.push(task);
    });

    // 保存
    await kv.put(TASKS_KEY, JSON.stringify(tasks));

    return jsonResponse({
        success: true,
        message: `已添加 ${newTasks.length} 项任务`,
        tasks: newTasks,
        totalCount: tasks.length
    });
}

/**
 * PUT - 更新任务
 * 请求体：单个任务对象
 */
async function handlePut(request, kv) {
    const task = await request.json();

    if (!task.id) {
        return jsonResponse({ error: '缺少任务ID' }, 400);
    }

    const userName = decodeURIComponent(request.headers.get('X-User-Name') || '匿名');

    // 读取现有任务
    const data = await kv.get(TASKS_KEY, 'json');
    const tasks = data || [];

    // 查找并更新
    const index = tasks.findIndex(t => t.id === task.id);
    if (index === -1) {
        // 不存在则添加
        task.createdBy = task.createdBy || userName;
        task.updatedBy = userName;
        task.updatedAt = new Date().toISOString();
        if (!task.createdAt) {
            task.createdAt = new Date().toISOString();
        }
        tasks.push(task);
    } else {
        // 合并更新
        tasks[index] = Object.assign(tasks[index], task, {
            updatedBy: userName,
            updatedAt: new Date().toISOString()
        });
    }

    await kv.put(TASKS_KEY, JSON.stringify(tasks));

    return jsonResponse({
        success: true,
        message: '任务已更新',
        task: tasks[index !== -1 ? index : tasks.length - 1]
    });
}

/**
 * DELETE - 删除任务
 * 查询参数：?id=task_id
 */
async function handleDelete(request, kv) {
    const url = new URL(request.url);
    const taskId = url.searchParams.get('id');

    if (!taskId) {
        return jsonResponse({ error: '缺少任务ID' }, 400);
    }

    const data = await kv.get(TASKS_KEY, 'json');
    const tasks = data || [];

    const index = tasks.findIndex(t => t.id === taskId);
    if (index === -1) {
        return jsonResponse({ error: '任务不存在' }, 404);
    }

    const removed = tasks.splice(index, 1)[0];
    await kv.put(TASKS_KEY, JSON.stringify(tasks));

    return jsonResponse({
        success: true,
        message: '任务已删除',
        task: removed
    });
}

/**
 * 返回 JSON 响应
 */
function jsonResponse(data, status) {
    return new Response(JSON.stringify(data), {
        status: status || 200,
        headers: CORS_HEADERS
    });
}
