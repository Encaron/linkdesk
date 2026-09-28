# `fixtures/status-demo/` —— 第三方插件视角的状态行夹具

> **归属**：**开发期夹具**（同 `scripts/dev/` 的规矩：不进软件产物、不占版本号、不接 `npm run check` 链）。
> 立件依据 = M4 `AI#38.12`（只读状态行 ＋ 分节副标题是**开放契约**，⛔ 不为本系列开特权）。

## 它证什么

设置页里那两种「不像普通配置项」的行，**第三方插件也声明得出来**：

| 声明 | 屏幕上是 | 值的来源 |
|---|---|---|
| `renderHint:"readonly"` ＋ `statusCommand` | 只读状态行（**每 3 秒重新取值**） | 该键的 `statusCommand`：插件自己的命令返回值 |
| `renderHint:"action"` ＋ `actionCommand` | 动作按钮（文案 = `description`） | 点了执行 `actionCommand` |
| `subtitle` / `groupDescriptions` | 分节副标题（标题下那行小字） | 插件 manifest 里自己写的 |

两条命令都在 `index.bundle.js` 里由**插件自己**注册（零 import、零壳内坐标）：
`status-demo.probe` 返回带时间戳的活读数（时间戳会自己往前走 ⇒ 证明**每次重新取值**、不走配置存储）；
`status-demo.poke` 往自己的配置键写一行时间戳（证明**按钮真的执行了命令**）。

## 怎么装（隔离实例）

```bash
# ① 插件家 = 隔离实例自己的 userData（见 ../README.md「隔离实例里装插件」）
ISO="$TEMP/linkdesk-iso"
mkdir -p "$ISO/plugins/status-demo"
cp scripts/dev/fixtures/status-demo/* "$ISO/plugins/status-demo/"

# ② Vite 要认得那家（否则视图挂在 Failed to fetch dynamically imported module）
LINKDESK_USER_PLUGINS_HOME="$ISO/plugins" npm run dev

# ③ 起隔离实例（等号形！），设置页左导航应多出「状态行夹具」一项（3 键）
electron . --remote-debugging-port=9333 --user-data-dir="$ISO"
```

## 读数的样子（2026-09-28 实测，M4 AI#38.12 验收）

- 左导航「状态行夹具 **3**」（键数 = 声明数）；
- 只读行读数从 `20:37:27` 自己走到 `20:37:30`（3 秒重取）；
- 动作按钮**可点**（`disabled:false`），点后 `status-demo.plain` 变成 `被戳过 · <时间>`；
- 同组里的普通行（`status-demo.plain`）照常按 `type` 渲染——没有被这两个 hint 影响。
