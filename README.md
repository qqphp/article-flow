# 墨稿 · AI 文章工作台

基于 Next.js 的公众号与内容矩阵创作工作台。包含写作向导、Firecrawl 搜索、知乎开放平台数据、AI 生成、去痕、封面/段落配图、素材库、发布队列和微信公众号草稿发布。

## 运行

```bash
npm install
copy .env.example .env.local
npm run dev
```

打开 `http://localhost:3000`。未配置密钥时，生成、去痕、图片和发布接口会使用本地演示回退，方便直接体验界面；配置 `.env.local` 后会调用真实服务。

## 配置

环境变量模板在 `.env.example`：

- `AI_BASE_URL`、`AI_API_KEY`、`AI_TEXT_MODEL`：OpenAI 兼容文本模型
- `AI_IMAGE_URL`、`AI_IMAGE_MODEL`：图片生成接口
- `FIRECRAWL_API_KEY`：资料搜索
- `ZHIHU_ACCESS_SECRET`：知乎数据开放平台 Access Secret
- `WECHAT_APPID`、`WECHAT_SECRET`、`WECHAT_AUTHOR`：微信公众号草稿发布

API 路由：

- `POST /api/generate`：文章生成，可选搜索
- `POST /api/humanize`：文章去痕
- `POST /api/images`：封面/插图生成
- `POST /api/publish`：微信公众号创建草稿
- `POST /api/zhihu/quota`：知乎当日额度
- `POST /api/zhihu/hot-list`：知乎热榜
- `POST /api/zhihu/global-search`：全网搜索
- `POST /api/zhihu/search`：知乎站内搜索
- `POST /api/zhihu/zhida`：知乎直答（支持流式）
- `POST /api/zhihu/pdf/upload`：上传 PDF
- `POST /api/zhihu/pdf/tasks`：创建 PDF 解析任务
- `POST /api/zhihu/pdf/status`：查询 PDF 解析任务
- `POST /api/zhihu/ppt/tasks`：创建 PPT 生成任务
- `POST /api/zhihu/ppt/status`：查询 PPT 生成任务

生产构建：

```bash
npm run build
```
