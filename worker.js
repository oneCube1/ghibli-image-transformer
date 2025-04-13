/**
 * 吉卜力风格图片转换 Worker
 */

// 定义允许的来源（CORS设置）
const ALLOWED_ORIGINS = ['您的Vercel前端域名', 'http://localhost:3000'];

// 处理跨域请求的头部
function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// 提取图片URL的辅助函数
function extractImageUrl(content) {
  // 尝试提取Markdown格式的图片链接: ![alt](url)
  const markdownPattern = /!\[.*?\]\((https?:\/\/[^)]+)\)/;
  const markdownMatch = content.match(markdownPattern);
  if (markdownMatch) return markdownMatch[1];
  
  // 尝试提取直接URL格式: http(s)://example.com/image.jpg
  const urlPattern = /(https?:\/\/\S+\.(jpg|jpeg|png|gif))/i;
  const urlMatch = content.match(urlPattern);
  if (urlMatch) return urlMatch[1];
  
  return null;
}

// 异步处理图片的函数
async function processImageAsync(taskId, imageBase64, env) {
  try {
    // 更新状态为"正在处理"
    await env.IMAGE_TASKS.put(taskId, JSON.stringify({
      status: 'processing',
      updated: Date.now()
    }));
    
    // 调用云雾AI API
    const aiResponse = await fetch("https://yunwu.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        'Accept': 'application/json',
        'Authorization': 'Bearer sk-a1rL1XFLv6xMZ0qvZKJbuTAtTX51eLlvcIJTRbD0aMG6bQaz',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "gpt-4o-image-vip",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { 
            role: "user",
            content: [
              { type: "text", text: "保持图片主题和背景元素不变，把图片变成吉卜力风格" },
              { type: "image_url", image_url: { url: imageBase64 } }
            ]
          }
        ]
      })
    });
    
    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '';
    const imageUrl = extractImageUrl(content);
    
    // 保存处理结果
    await env.IMAGE_TASKS.put(taskId, JSON.stringify({
      status: 'completed',
      resultUrl: imageUrl,
      completed: Date.now()
    }));
  } catch (error) {
    console.error("AI处理错误:", error);
    // 保存错误信息
    await env.IMAGE_TASKS.put(taskId, JSON.stringify({
      status: 'failed',
      error: error.message,
      completed: Date.now()
    }));
  }
}

// 解析formData获取图片
async function parseFormData(request) {
  const formData = await request.formData();
  const imageFile = formData.get('image');
  
  if (!imageFile) {
    throw new Error('没有上传图片');
  }
  
  // 读取文件内容
  const arrayBuffer = await imageFile.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);
  
  // 转换为base64
  const base64 = btoa(String.fromCharCode.apply(null, buffer));
  return `data:${imageFile.type};base64,${base64}`;
}

// Cloudflare Worker 导出结构
export default {
  async fetch(request, env, ctx) {
    return await handleRequest(request, env, ctx);
  }
};

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  const isAllowedOrigin = ALLOWED_ORIGINS.includes(origin) || !origin;
  
  // 处理OPTIONS预检请求
  if (request.method === 'OPTIONS') {
    if (!isAllowedOrigin && origin) {
      return new Response(null, { status: 403 });
    }
    
    return new Response(null, {
      status: 204,
      headers: corsHeaders(origin)
    });
  }

  // 不允许的来源返回403
  if (!isAllowedOrigin) {
    return new Response('Forbidden', { status: 403 });
  }

  // 处理图片上传请求
  if (request.method === 'POST' && url.pathname === '/api/transform') {
    try {
      // 解析multipart/form-data获取图片
      const imageBase64 = await parseFormData(request);
      
      // 生成唯一任务ID
      const taskId = crypto.randomUUID();
      
      // 保存任务初始状态到KV
      await env.IMAGE_TASKS.put(taskId, JSON.stringify({
        status: 'pending',
        created: Date.now()
      }));
      
      // 异步处理图片（不等待完成）
      ctx.waitUntil(processImageAsync(taskId, imageBase64, env));
      
      // 立即返回任务ID
      return new Response(
        JSON.stringify({ 
          success: true,
          taskId: taskId,
          message: '任务已提交，请轮询获取结果'
        }),
        { 
          status: 202,
          headers: {
            ...corsHeaders(origin),
            'Content-Type': 'application/json'
          }
        }
      );
    } catch (error) {
      console.error("处理请求出错:", error);
      return new Response(
        JSON.stringify({ error: `处理请求出错: ${error.message}` }),
        { 
          status: 500,
          headers: {
            ...corsHeaders(origin),
            'Content-Type': 'application/json'
          }
        }
      );
    }
  } 
  // 处理状态查询请求
  else if (request.method === 'GET' && url.pathname.startsWith('/api/transform/status/')) {
    try {
      // 从URL提取任务ID
      const taskId = url.pathname.split('/api/transform/status/')[1];
      
      // 从KV读取任务状态
      const taskData = await env.IMAGE_TASKS.get(taskId, { type: 'json' });
      
      if (!taskData) {
        return new Response(
          JSON.stringify({ error: '任务不存在' }),
          { 
            status: 404,
            headers: {
              ...corsHeaders(origin),
              'Content-Type': 'application/json'
            }
          }
        );
      }
      
      // 返回当前状态
      return new Response(
        JSON.stringify(taskData),
        { 
          status: 200,
          headers: {
            ...corsHeaders(origin),
            'Content-Type': 'application/json'
          }
        }
      );
    } catch (error) {
      console.error('轮询错误:', error);
      return new Response(
        JSON.stringify({ error: '轮询错误' }),
        { 
          status: 500,
          headers: {
            ...corsHeaders(origin),
            'Content-Type': 'application/json'
          }
        }
      );
    }
  }
  else {
    return new Response(
      'Method Not Allowed', 
      { 
        status: 405,
        headers: corsHeaders(origin)
      }
    );
  }
} 