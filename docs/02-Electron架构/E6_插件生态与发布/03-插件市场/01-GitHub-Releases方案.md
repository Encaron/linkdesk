# GitHub Releases——插件市场后端

> 对应任务：E6#15-#16。用 GitHub Releases 作为免费文件存储 + marketplace.json 作为插件目录。

---

## 一、为什么选 GitHub Releases

| 方案 | 存储费用 | 带宽费用 | 复杂度 |
|:--|:--|:--|:--|
| GitHub Releases | 免费 | 免费 | 低——手动上传或 API |
| 自建服务器 | 月付 | 月付 | 高——运维 |
| AWS S3 + CloudFront | 按量付费 | 按量付费 | 中 |
| Vercel + 静态文件 | 免费（有限额） | 免费 | 低——但文件大小有限制 |

GH Releases：不限流量、不限文件大小（单个 asset ≤ 2GB）、免费、全球 CDN。

---

## 二、仓库结构

```
github.com/encaron/linkdesk-marketplace/
  ├── marketplace.json       ← 插件目录（所有插件的索引）
  ├── README.md              ← 发布指南
  └── Releases/              ← GitHub Releases（插件文件存储）
      ├── hello-world v1.0.0
      │   └── hello-world.linkdesk-plugin
      └── hello-world v1.1.0
          └── hello-world.linkdesk-plugin
```

---

## 三、marketplace.json 格式

```json
{
  "version": "1",
  "updatedAt": "2026-08-07T12:00:00Z",
  "plugins": [
    {
      "id": "hello-world",
      "name": "Hello World",
      "version": "1.0.0",
      "description": "A test plugin that demonstrates LinkDesk plugin capabilities",
      "author": {
        "name": "Encaron",
        "url": "https://github.com/encaron"
      },
      "icon": "Smile",
      "iconSource": "lucide",
      "category": "demo",
      "downloadUrl": "https://github.com/encaron/linkdesk-marketplace/releases/download/hello-world-v1.0.0/hello-world.linkdesk-plugin",
      "size": 245760,
      "publishedAt": "2026-08-07T12:00:00Z",
      "minAppVersion": "1.0.0"
    }
  ]
}
```

### 字段说明

| 字段 | 必需 | 说明 |
|:--|:--|:--|
| `id` | ✅ | 唯一标识（小写+连字符） |
| `name` | ✅ | 显示名称 |
| `version` | ✅ | semver |
| `description` | ✅ | 一句话描述 |
| `author.name` | ✅ | 作者名 |
| `downloadUrl` | ✅ | 下载直链 |
| `size` | ✅ | 文件大小（bytes）——显示下载大小 |
| `icon` | - | 图标名（Lucide 或 codicon） |
| `iconSource` | - | "lucide" / "codicon" / "url" |
| `category` | - | 分类 |
| `publishedAt` | - | 发布日期 |
| `minAppVersion` | - | 最低 LinkDesk 壳版本 |

### 3.1 扩展性——加字段不破坏旧插件

`marketplace.json` 的字段设计是**纯增量**的。将来加 `screenshots`、`readmeUrl`、`changelog` 等新字段：

- 新插件 → 可以填新字段
- 旧插件 → JSON 里没有新字段 → marketplace 渲染时跳过 → 只是少显示一块内容，不报错
- 作者升级 `@linkdesk/plugin-sdk` → 获得新字段的类型提示和验证

**对标 VS Code：** `package.json` 的 `contributes` 从 1.0 到现在加了几十个新贡献点。旧扩展不升级不崩。LinkDesk 同理。

---

## 四、读取方式

marketplace 插件启动时：

```typescript
const MARKETPLACE_URL =
  "https://raw.githubusercontent.com/encaron/linkdesk-marketplace/main/marketplace.json";

const response = await fetch(MARKETPLACE_URL);
const data = await response.json();
```

缓存策略：
- 首次加载 → 缓存到本地 Storage
- 后续 → 先读缓存（5 分钟内），后台拉取更新
- 拉取失败 → 用缓存

---

## 五、发布流程（v1.0 手动版）

```
1. 作者 npm run build → 产出 my-plugin.linkdesk-plugin
2. 打开 GitHub Releases 页面 → 新建 Release
   - Tag: my-plugin-v1.0.0
   - 上传 my-plugin.linkdesk-plugin
   - 发布
3. 编辑 marketplace.json → 加一条目 → commit
4. 完成
```

### 未来自动化版（v1.1）

```
npm run publish
→ 读 GITHUB_TOKEN
→ GitHub API: 创建 Release + 上传 asset
→ GitHub API: 更新 marketplace.json
→ 完成
```

---

> **← 上一层：** `../02-插件开发工具链/`
> **→ 下一文档：** `02-壳内下载安装.md`
