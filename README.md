# 吉卜力风格图片生成器

这是一个使用AI技术将普通图片转换为吉卜力风格的网页应用。项目采用前后端分离架构，通过Cloudflare Pages部署前端，Cloudflare Workers部署后端API。

## 项目结构

- `index.html` - 前端页面，用于用户上传图片和显示结果
- `worker.js` - 后端Worker，处理图片转换请求
- `wrangler.toml` - Cloudflare Workers配置文件

## 功能特点

- 拖放或点击上传图片
- 实时预览原始图片
- 将图片转换为吉卜力风格
- 响应式设计，适配不同设备
- 异步处理+轮询架构，避免Cloudflare Workers 10秒超时限制

## 部署指南

本项目使用GitHub托管代码，Cloudflare Pages和Workers进行部署。

### 部署前准备

1. 注册GitHub账号
2. 注册Cloudflare账号
3. 创建KV命名空间
   ```bash
   wrangler kv:namespace create "IMAGE_TASKS"
   ```
4. 更新wrangler.toml中的KV命名空间ID

### KV配置

项目使用Cloudflare KV存储任务状态和处理结果：

```toml
kv_namespaces = [
  { binding = "IMAGE_TASKS", id = "11202d3a135e46f6b7065601d35590d4" }
]
```

## 工作原理

1. 用户上传图片到前端
2. 前端发送图片到Worker API
3. Worker立即返回一个任务ID
4. 前端开始轮询任务状态
5. Worker在后台异步处理图片（转为base64 → 调用AI API）
6. 处理完成后，Worker更新KV中的任务状态
7. 前端轮询检测到任务完成，显示结果图片

## 使用方法

1. 打开网页应用
2. 点击或拖放图片到上传区域
3. 点击"生成吉卜力风格图片"按钮
4. 等待处理完成后查看结果

## 技术栈

- 前端：HTML, CSS, JavaScript
- 后端：Cloudflare Workers
- 存储：Cloudflare KV
- API：云雾AI API 