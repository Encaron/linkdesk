# builtin/ 与 user/ 语义规范

> 🔥 **三条铁律。** 新 AI 进场——理解 `builtin/`、`user/`、`core:true` 三者关系必读。

---

## 一、铁律

```
1. core: true  → 隐藏卸载按钮。这是唯一判断依据。
                 和插件在哪个文件夹无关。

2. builtin/    → 只能随软件发出，或用户手动丢文件进入。
                 插件市场不往这里装。

3. user/       → 插件市场下载的唯一目的地。
                 出厂预装的非必需插件也在这里。
```

---

## 二、三者关系

```
                    core:true？
                   /          \
                 是             否
                /                \
          隐藏卸载按钮          显示卸载按钮
       （不管在哪个文件夹）   （不管在哪个文件夹）

        在 builtin/？          在 user/？
        /         \           /        \
      是           否        是         否
     /              \       /            \
  只能随软件       市场下   出厂预装      市场下载
  发出或手动       载的也   或市场下      的第三方
  丢入             可以     载的         插件
```

---

## 三、文件夹来源

| 来源 | 写入目标 | 谁写的 |
|:--|:--|:--|
| 壳安装包 | `bundled-plugins/builtin/` → 首次启动 → `{userData}/plugins/builtin/` | 壳自动安装 |
| 壳安装包 | `bundled-plugins/user/` → 首次启动 → `{userData}/plugins/user/` | 壳自动安装 |
| 插件市场 | `{userData}/plugins/user/` | 用户点"安装" |
| 用户手动 | `{userData}/plugins/builtin/` 或 `user/`（用户自己选） | 用户手动丢文件 |

---

## 四、三个典型场景

### 场景 A：出厂预装的 serial-monitor（`user/`、无 `core:true`）

```
位置：resources/bundled-plugins/user/serial-monitor.linkdesk-plugin
首次启动 → 解压到 {userData}/plugins/user/serial-monitor/
core:true → 不声明
卸载按钮 → 显示
用户卸载 → 从 user/ 删除 → 完成
重新安装 → 打开市场 → 搜索 → 下载 → 回 user/serial-monitor/
```

### 场景 B：出厂预装的 settings（`builtin/`、有 `core:true`）

```
位置：resources/bundled-plugins/builtin/settings.linkdesk-plugin
首次启动 → 解压到 {userData}/plugins/builtin/settings/
core:true → 声明
卸载按钮 → 隐藏（普通用户点不到）
高手删除 → 进 {userData}/plugins/builtin/ 删文件夹 → 设置消失
重新安装：
  - 方式 1：壳检测 bundled-plugins/ 有备份 → 自动恢复（用户无感知）
  - 方式 2：用户打开市场 → 搜索 "settings" → 下载 → 进 user/settings/
             plugin.json 里 core:true 还在 → 卸载按钮仍隐藏
```

### 场景 C：第三方插件 hello-world（市场下载）

```
用户打开市场 → 搜索 "hello-world" → 点安装
下载 → 解压到 {userData}/plugins/user/hello-world/
core:true → 不声明
卸载按钮 → 显示
卸载 → 从 user/ 删除 → 完成
```

---

## 五、为什么不把市场下载的放到 builtin/

因为 `builtin/` 的语义是"随软件发出的"。如果市场也能往里写 → 用户卸载了官方文件树 → 自己装了个第三方的 → 第三方插件进了 `builtin/` → 但 `builtin/` 里的东西应该全部是官方随软件发的 → 乱了。

**市场只写 `user/`。** 干净。

---

## 六、installed-plugins.json 记录来源

```json
{
  "file-tree": {
    "version": "1.0.0",
    "source": "builtin",         ← 三个来源之一
    "installedAt": "..."
  },
  "serial-monitor": {
    "version": "1.0.0",
    "source": "user",            ← 出厂预装
    "installedAt": "..."
  },
  "hello-world": {
    "version": "1.0.0",
    "source": "marketplace",     ← 市场下载
    "installedAt": "..."
  }
}
```

`source` 字段记录来源——用途：
- `"builtin"` → 壳完整性检查时知道可以从 `bundled-plugins/` 恢复
- `"user"` → 出厂预装，可卸载
- `"marketplace"` → 用户主动安装的第三方插件

---

> **← 上一文档：** `05-内置插件迁移指南.md`
