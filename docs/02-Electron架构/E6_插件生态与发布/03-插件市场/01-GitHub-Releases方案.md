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
| `size` | ✅ | 文件大小（bytes）——显示下载大小；**下载后校验实际字节，显著不符 → 警告 toast（09 §二，不拒装仅提示）** |
| `checksum` | - | 作者 sha256——下载后校验完整性（09 §二）；旧条目无此字段 → 跳过校验（纯增量兼容） |
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

### 3.2 新增字段（2026-08-29 第一站体验——纯增量，旧插件不填不崩）

| 新字段 | 必需 | 说明 |
|:--|:--|:--|
| `versions[]` | - | 版本历史 `{version, downloadUrl, publishedAt, changelog?}`，**最新在前**；顶层 `version`/`downloadUrl` 仍 = 最新（兼容旧条目）——版本下拉数据源 |
| `readmeUrl` | - | 作者仓库 raw README——未装插件详情页数据源 |
| `screenshots[]` | - | 截图 URL 数组——详情页画廊 |
| `license` | - | 许可证标识——详情页侧栏 |
| `categories[]` | - | 多分类（替代单 `category`） |
| `icon` url 形态 | - | 作者自制彩色图标（SVG/PNG 直接 `<img>`；`iconSource: "url"` 既有兜底） |

交互设计 → [03-市场交互设计.md](03-市场交互设计.md)。配套：`.linkdesk-plugin` 包内带 `README.md`（E6#4a 打包补）。

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
- **parse 失败（catalog 手改坏/非法 JSON）→ 用缓存；无缓存 → 空态「目录损坏」+ [重试]**（缝隙 G12）
- **全源不可达 + 无缓存（首次离线）→ 探索组空态「无法加载市场，请联网重试」+ [重试]**（缝隙 G8）

---

## 四·五、下载临时文件（缝隙 B1——下载中关软件）

- 下载文件落 `{userData}/tmp/*.part`（半截标记）→ 完成后 rename 为正式包。
- 下载中用户退出软件 → 启动时清理 `tmp/*.part` 残留（孤儿临时文件不留）。

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

## 六、多市场源（2026-08-17 用户拍板）

> **单中心目录 → 多源。** 让第三方作者发布到**自己的**仓库，无需进入中心目录；用户/AI 添加任意 GitHub 仓库为市场源即可发现安装。改动只在 marketplace 插件内部，壳零改动。

### 6.1 为什么

单中心目录（`encaron/linkdesk-marketplace`）有个瓶颈：第三方作者 agentA 发布插件需要中心写权限/PR——「别人怎么知道」这一环卡在审批上。AI 一站式场景（agentA 制作上传 → 另一台电脑 agentB 主动下载使用）要求：**发布即可见，无需中间人**。

多源化 = 对标 VS Code 多 marketplace / npm 多 registry——索引开放，人人可发布，人人可发现。

### 6.2 模型

```
默认源        encaron/linkdesk-marketplace     （官方目录）
作者源 A      agentA/linkdesk-marketplace      （任意 GitHub 仓库，根目录有 marketplace.json）
作者源 B      agentB/plugins                    （同上）

用户/AI 在设置里「添加市场源」填仓库 URL
  → marketplace 插件 fetch 全部源 → 合并去重（同 id 取版本高者）→ 商店统一展示
```

### 6.3 源列表数据结构（marketplace.json 格式零改动——纯增量）

源列表独立存（settings.json 或 marketplace 插件专用配置）：

```json
{
  "marketplaceSources": [
    { "id": "official", "default": true,
      "url": "https://raw.githubusercontent.com/encaron/linkdesk-marketplace/main/marketplace.json" },
    { "id": "agent-a",
      "url": "https://raw.githubusercontent.com/agentA/linkdesk-marketplace/main/marketplace.json" }
  ]
}
```

每个源都是同一个 marketplace.json schema——现有格式、现有字段，加新字段不破坏。

### 6.4 行为

| 场景 | 行为 |
|:--|:--|
| 启动 | fetch 全部源 → 合并 → 展示 |
| 同 id 冲突 | 取版本高者（semver） |
| 单源失败 | 跳过不阻塞其他源，用该源缓存兜底 |
| 来源标注 | 商店卡片/列表显示来源仓库名——用户知道装的是谁的 |
| 发布 | 作者 `npm run publish` → 自己仓库 Releases + 自己的 marketplace.json → 完成（无需中心审批） |

### 6.5 人 vs AI

- **人**：商店 UI 照旧（多源合并成卡片网格），多一个「添加市场源」入口
- **AI**：agentA 上传到自己的仓库 = 自己说了算；agentB 拿到源 URL 即可添加 + 安装（URL 直装）

### 6.6 任务归属

- **读取侧** → E6#30c：marketplace 插件多源支持（源列表配置化 + 合并去重 + 来源标注）
- **发布侧** → E6#26b：作者发布到自己的仓库（Releases + 自己的 marketplace.json）
- 壳零改动——全部在 marketplace 插件内部

---

> **← 上一层：** `../02-插件开发工具链/`
> **→ 下一文档：** `02-壳内下载安装.md`
