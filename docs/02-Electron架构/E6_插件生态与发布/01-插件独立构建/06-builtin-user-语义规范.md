# core:true 语义规范（塌平后——builtin/user 双目录已废）

> 🔥 **一条铁律。** 新 AI 进场——插件身份唯一来源是 plugin.json 声明字段（CLAUDE.md 硬约束 11），**没有任何"文件夹决定插件属性"**。
> **2026-09-05 用户拍板「全面塌平」——`plugins/builtin/` + `plugins/user/` 双目录废除**，三层（repo `plugins/` + userData `{userData}/plugins/` + 发货夹 `bundled-plugins/`）全平铺 `plugins/<id>` / `<id>.linkdesk-plugin`。决策实录 + 改动面 + 验证 → [09-插件目录塌平决策.md](09-插件目录塌平决策.md)。
> 本文档原名「builtin/ 与 user/ 语义规范」——其按文件夹分插件的全部内容已作废，收编为下文的 core:true 语义 + 账本 source 词汇。

---

## 一、铁律

```
core: true → 声明在 plugin.json。这是插件唯一「内置」维度：
            隐藏卸载按钮（普通用户）+ 自动恢复账本保护（删文件夹→从发货夹恢复）。

内置插件不是特殊插件——只是声明了 core:true 的插件，任何插件都可声明。
当初分 builtin/ + user/ 文件夹只为一个目的：怕用户把 settings/插件市场等
从文件夹直接删掉。文件夹从未真正挡住删除（高手删哪层一样易），
真保护 = core:true + 自动恢复账本，二者都与文件夹无关 → 文件夹是纯冗余副本，塌平删除。
```

出处：[[factory-vs-marketplace-plugins]]「core:true 唯一语义 = 跟着发行版打包不可卸载，不是种族隔离」。**禁止给 core:true 插件搞特殊**——它们与任何插件同一条加载/安装/卸载路径，只多「卸载按钮隐藏 + 崩溃恢复优先」。

## 二、安装落点（塌平后单一目的地，无子目录）

| 来源 | 写入目标 | 谁写的 |
|:--|:--|:--|
| 壳安装包（随带） | `bundled-plugins/<id>.linkdesk-plugin` → 首次启动 → `{userData}/plugins/<id>/` | 壳自动安装 |
| 插件市场 | `{userData}/plugins/<id>/`（与 bundled 同目的地） | 用户点「安装」 |
| dev / 目录来源 | dev 写 `plugins/<id>` 源树；目录安装走 installPlugin 落对应 app 根 `plugins/<id>` | 安装 API |

core:true 与否 **不改变落点**——settings 与第三方 hello-world 解压到同一层 `{userData}/plugins/<id>/`。

## 三、installed-plugins.json 的 source 词汇（唯一保留 builtin/user 字面处）

```json
{
  "settings":        { "version": "1.0.0", "source": "builtin",     "installedAt": "..." },
  "serial-monitor":  { "version": "1.0.0", "source": "user",        "installedAt": "..." },
  "hello-world":     { "version": "1.0.0", "source": "marketplace", "installedAt": "..." }
}
```

`source` = **语义来源**（谁给的这个插件），不是物理目录——塌平后物理上所有插件都在 `{userData}/plugins/<id>`：

- `"builtin"` → 联合成员仅保留**兼容旧账本**：历史双层制里随壳发出的 core:true 件记过 builtin。塌平后 `sourceFromSubdir(subdir)` 恒收 `subdir === "builtin" ? "builtin" : "user"`，磁盘扫描不再产出新 builtin——dir 发现全落 `"user"`。（硬约束 #18/#20 账本重设计自有其职，此处不越权。）
- `"user"` → 磁盘事实默认语义：出厂随带可卸件、dev/手动安装、目录差集自动发现的插件。
- `"marketplace"` → 用户主动装的第三方（lifecycle install 传 `ledgerSource: "marketplace"`）。

**除了这一处词汇，代码/文档禁止再发明「内置插件」「用户插件」的文件夹分类名词**（硬约束 11）——描述插件只能用 plugin.json 声明字段：`core: true 的插件`、随带/可卸等按声明说。

## 四、典型场景（塌平后）

### 场景 A：serial-monitor（随带、无 core:true）
```
位置：bundled-plugins/serial-monitor.linkdesk-plugin → {userData}/plugins/serial-monitor/
core:true → 不声明
卸载按钮 → 显示；卸载 = 卸载 API 真删（removed 语义属 #18）
重装 → 市场 / 发货夹补发，仍落 {userData}/plugins/serial-monitor/
```

### 场景 B：settings（随带、声明 core:true）
```
位置：bundled-plugins/settings.linkdesk-plugin → {userData}/plugins/settings/
core:true → 声明
卸载按钮 → 隐藏（普通用户点不到；高手走卸载 API 可换自己的——#18 不硬拦）
误删文件夹 → 壳检测 bundled-plugins/ 有备份 → 自动恢复（installed-plugins.json 无 removed 标记时）
```

### 场景 C：第三方 hello-world（市场下载）
```
下载 → 解压 {userData}/plugins/hello-world/ ——与 bundled 同目的地，无独立 user/ 目录
core:true → 不声明
卸载按钮 → 显示
```

---

> **← 上一文档：** `05-内置插件迁移指南.md` ｜ **塌平决策：** `09-插件目录塌平决策.md` ｜ **格式规范：** `02-linkdesk-plugin格式规范.md`
