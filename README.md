# 墨稿 · AI 文章工作台

基于 Next.js 的公众号与内容矩阵创作工作台。包含写作向导、Firecrawl 搜索、知乎开放平台数据、AI 生成、去痕、封面/段落配图、素材库、发布队列和微信公众号草稿发布。

![站点演示](./public/demo/demo1.gif)

## 运行

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`。首次启动后，在左侧 **配置中心** 填写模型、Firecrawl、知乎和微信公众号密钥。未配置时，生成、去痕、图片和发布接口会使用本地演示回退，方便直接体验界面。

配置保存在本地 SQLite（`data/article-flow.sqlite`），文章和素材文件在 `data/articles`、`data/materials`。

## 配置

日常以应用内 **配置中心** 为准，保存后立即生效。可选地把 `.env.example` 复制为 `.env.local` 作为尚未写入配置中心时的兜底：

```bash
copy .env.example .env.local
```

- `AI_BASE_URL`、`AI_API_KEY`、`AI_TEXT_MODEL`：OpenAI 兼容文本模型
- `AI_IMAGE_URL`、`AI_IMAGE_MODEL`：图片生成接口
- `FIRECRAWL_API_KEY`：资料搜索
- `ZHIHU_ACCESS_SECRET`：知乎数据开放平台 Access Secret
- `WECHAT_APPID`、`WECHAT_SECRET`、`WECHAT_AUTHOR`：微信公众号草稿发布

配置中心里的值优先于环境变量。模型接口地址必须是公网 http(s)，不能指向本机或内网。

API 路由：

- `POST /api/generate`：文章生成，可选搜索
- `POST /api/humanize`：文章去痕
- `POST /api/article-images`：封面/段落配图生成
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
