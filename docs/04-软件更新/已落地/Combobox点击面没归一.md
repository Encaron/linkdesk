# 已落地 · Combobox 的「点击面」没跟 SelectBox 一起搬过来（箭头只能关、不能开）

> **已落地（2026-09-27 用户实机挑出 → 当日查清 → 当日修 ＋ 补 7 条鼠标路径用例；⏳ 未发版**——改动在 dev 累积，随用户下一批一起 release）。
> **⏳ 待用户实机验收**：机械面已全绿，但真实浏览器里的点击手感**只有用户能判**（本档不替它说「已验收」）。
> **用户原话**：「在串口监视器中，那个既可以下拉选择波特率，又可以自己输入的组件，是属于谁的？是壳组件吗？它有 bug，点击很受限，是不是文本框之类的有点长，把下拉的小箭头盖住了之类的，反正它的操作很受限，很难用，是不是当时这个下拉组件没有很好适配既可以输入文字，又可以下拉的场景？其他地方更多是只有下拉，不过无法保证未来不会出现这种双形态共存的」。
> **归属**：软件本体——`src/components/shared/combobox/`（壳共享组件，`@linkdesk/ui` 单源）。**插件侧零代码改动**：`serial-monitor` 只是消费者（`BaudInput.tsx` 一行 `<Combobox>`），修的这份源码经别名同时服务壳与插件。
> **用户三问的答案**：是壳组件（对）· **不是**文本框盖住箭头（错）· 是当年**没把可点面一起搬过来**（对，但漏的不是「适配双形态」，是「单一点击面」）。

## 零、先把用户猜的方向钉死（免得后人往「尺寸/遮挡」查）

| 用户的猜测 | 实测 |
|:--|:--|
| 「文本框有点长，把下拉的小箭头盖住了」 | ❌ **物理上不可能**——`input { flex: 1; min-width: 0 }`（`Combobox.css:50-51`）与箭头 `{ flex-shrink: 0 }` 是 flex 布局里的**并排两项**，输入框再长也只在自己那一格里增长，箭头永远拿得到自己那份宽度。**没有任何重叠** |
| 「操作很受限、很难用」 | ✅ **完全成立**——但受限的不是尺寸，是**可点面积**：field 里真正能点的只剩 `<input>` 自己的像素 |
| 「其他地方更多是只有下拉，未来会有双形态共存」 | ✅ 双形态前置判据已落（见 §五）——但本件的 bug 与「双形态」无关，是「**单一可点面**」丢了 |

## 一、根因：搬了 SelectBox 的**视觉**，没搬它的**点击面**

同一个视觉语言的两份实现，差别只有一处：

```tsx
// src/components/shared/select-box/SelectBox.tsx:140-152（改前改后都这样）
<button
  type="button"
  className="ldk-selectbox-trigger"
  onClick={() => setOpen((v) => !v)}     // ← 整块触发器 = 一个按钮 = 单一可点面
>
  {display}
  <span className="codicon codicon-chevron-down ldk-selectbox-arrow" />
</button>
```

```tsx
// src/components/shared/combobox/Combobox.tsx（改前）——同一套 field/arrow/下拉面板视觉，但：
<div className="ldk-combobox-field">          {/* ← 无任何点击处理 */}
  <input className="ldk-combobox-input" ... /> {/* ← 唯一能点的地方 */}
  <span className="codicon ... ldk-selectbox-arrow" />  {/* ← 无处理器、不可聚焦（纯装饰） */}
</div>
```

于是用户实测到的每一条都能对上：

| 操作 | 改前行为 | 机制 |
|:--|:--|:--|
| 点**箭头**（下拉关着） | **什么都不发生** | span 不可聚焦、field 无点击处理 ⇒ 无任何响应 |
| 点**箭头**（下拉开着） | 下拉**关掉** | 原生「mousedown 落在不可聚焦元素 ⇒ 当前焦点元素 blur」⇒ `input.onBlur → commit → setOpen(false)` |
| 点 field 的**内边距 / 间隙**（`padding: 3px 6px` ＋ `gap: 4px`，`Combobox.css:16-17`） | 什么都不发生 | 同上——不是 input 的像素就没人管 |
| 点**输入框本身** | 正常 | 唯一活着的可点面 |

🔴 **一句话**：最像「下拉开关」的那颗箭头，**只能关、不能开**。用户说「点击很受限」正是这个——点开只能靠蒙中输入框那几个像素。

**为什么当年会这样**：本组件是 SelectBox 的超集（`E5.8#30.17`），下拉面板干脆共用同一个骨架组件（`SelectBoxDropdown`）、视觉也复用同一批类名（`.ldk-selectbox-dropdown/list/item/empty`，为过 `jscpd` 零克隆门禁）。视觉复用做得很干净——**但 `SelectBox` 真正的交互精髓是那个「整块触发器 = 一个 `<button>`」的单一可点面，这一条没跟着搬**。

> 教训（与本目录另一件同源）：**复用一个组件的「长相」时，要连带清点它的「交互骨架」**——长相搬干净了不代表行为也搬干净了。上一条同源教训见 [悬浮面板提示条没进收编.md](悬浮面板提示条没进收编.md)（那件是「判据只覆盖写法不覆盖机制」，本件是「复用只覆盖视觉不覆盖交互」）。

## 二、改法（3 处）

| # | 改什么 | 位置 |
|:--:|:--|:--|
| 1 | 新增 `handleFieldMouseDown`——**三分支**：① 箭头 = 下拉开关 ② 点输入框本身 = 原样放行（不打断拖动选字/定位光标）③ field 内边距/间隙（原死区）= 聚焦输入框 | `Combobox.tsx` |
| 2 | JSX 接线：`.ldk-combobox-field` 挂 `onMouseDown`；`input` / `arrow` 加 `ref`；箭头补 `aria-hidden="true"` | `Combobox.tsx` |
| 3 | 两条 CSS：`.ldk-combobox .ldk-selectbox-arrow { cursor: pointer }`（箭头显可点，改前它继承 `cursor: text`，长着一副「只能读」的样子）＋ `.ldk-combobox-field:focus-within { border-color: var(--accent) }`（补键盘焦点盲区：`input` 自身 `outline: none`，改前只有 `.ldk-selectbox-open` 一条 ⇒ Escape 关掉下拉但焦点仍在输入框时，边框退回常态、有焦点看不出来） | `Combobox.css` |

**三条关键设计约束（不是随手写的行为）**：

1. **不新增第二套开关状态**——箭头**复用既有的「聚焦 / 失焦」两条链**（未聚焦 → `input.focus()` ⇒ `onFocus` 开；已开 → `input.blur()` ⇒ `onBlur → commit` 关），没有引入第二个 `open` 真源，因此不可能与既有状态发散。
2. **`preventDefault()` 是必需的**，不是装饰——箭头分支里必须阻断原生「mousedown ⇒ 失焦」默认动作，否则会「先失焦提交、再聚焦」，一开一关打架。
3. **失焦提交语义原样不动**——「文本无变更不触发 `onChange`」这条 🔥 铁律（波特率变更会关旧重开端口）走的是同一条 `blur → commit`，一行没碰。关下拉时若用户刚手输了值，与「点外面」**同语义**地提交。

另有一处边界（Escape 之后）：`Escape` 关掉下拉时焦点**仍在**输入框，此时「已聚焦 ⇒ 不再触发 `onFocus`」，所以箭头分支与死区分支都在 `input.focus()` 之外**显式补一次 `setOpen(true)`**（幂等，不引入新状态）。

## 三、测试：改前 12 条用例**一条都没碰鼠标**

改前 `Combobox.test.tsx` 的 12 条全在**键盘 / 焦点 / 取值**路径上（`fireEvent.focus` / `keyDown` / `change` / `blur`）——**鼠标点击面 0 条**。所以「箭头只能关不能开」这个 bug 在测试里**完全不可见**：测试测的是「聚焦会打开」，而真实用户点的是箭头。

新增 **7 条**（新 `describe("Combobox 点击面（鼠标路径）")`）：

| 用例 | 钉住什么 |
|:--|:--|
| 点箭头（关着）→ 下拉打开 ＋ 输入框获得焦点 | 用户报的主症状 |
| 点箭头（开着）→ 下拉关闭，且文本无变更**不触发** `onChange` | 「只能关」那半 ＋ 提交语义不破 |
| 箭头关掉时文本有变更 → 提交（`onChange` 恰好 1 次） | 关下拉复用失焦提交链 |
| 🔥 Escape 关掉后点箭头能重新开 | 「已聚焦但已关」态——`onFocus` 不再触发，靠显式 `setOpen` |
| 点 field 内边距（原死区）→ 输入框获得焦点 ＋ 下拉打开 | 死区消失 |
| 点输入框本身 → 保持打开 | 分支② 早退，不误关（原生路径不被打断） |
| 箭头 `aria-hidden="true"` | 装饰字形不进可访问树（键盘开关是 ↑/↓/Enter/Escape） |

**负控已做**（不是「跑绿就算」）：把 JSX 上的 `onMouseDown={handleFieldMouseDown}` 摘掉、**测试一行不改** → 红 **5** 条（箭头三条 ＋ Escape 重开 ＋ field 死区），余 2 条（点输入框保持打开 / `aria-hidden`）照旧绿——**证明这 5 条真的在判这次的新机制，不是陪跑**。验完已还原。

## 四、验收

```bash
npx vitest run src/components/shared/combobox/Combobox.test.tsx   # 18/18 通过
npm run check                                                    # 全绿（203 文件 / 2754 条）
```

dev 手测（串口监视器 → 波特率那一格，`npm run electron:dev`）：

1. **不聚焦、直接点箭头** → 下拉展开（改前：毫无反应）。
2. **下拉开着，点箭头** → 收起；若刚手输过值，值**已生效**（与点输入框外面同效）。
3. **点格子的左右内边距 / 输入框与箭头之间的缝** → 输入框聚焦、下拉展开（改前：死区）。
4. 悬停箭头 → 光标是**手型**（改前是文本 I 形）。
5. **回归**：聚焦后 Tab 走开 / 点别处 → 提交语义与改前一致（无变更不触发 `onChange`）。

## 五、⚠️ 用户 2026-09-27 追加提问：「dev 里怎么还是没变？是串口监视器要更新一个版本吗？」

**答案：不需要给串口监视器升版本——缺的是把 `@linkdesk/ui` 的 dist 重新构建一次。** 这一节把链路钉死，免得后人重查。

**① 先证明"集中供给"机制正常在跑**（用户记忆里的设计：`E6#123` L9，改壳 UI 全生态跟走）：

| 检查 | 实测 |
|:--|:--|
| 插件 bundle 是自带一份 ui，还是裸 import？ | **裸 import**——`dist/serial-monitor.linkdesk-plugin/index.bundle.js` 里是 `@linkdesk/ui` 字符串，`ldk-combobox-input`（Combobox 实现体的特征串）**命中 0** ⇒ 插件**没有**内联副本 |
| dev 实际加载的那份安装副本呢（`{userData}/plugins/serial-monitor`） | 同样：`ldk-combobox-input` **0 命中** ＋ 带裸 `@linkdesk/ui` ⇒ **外置型**，运行时由宿主供给 |
| 插件仓 `node_modules/@linkdesk/ui` 装的是 0.2.13 旧版，要紧吗？ | **不要紧**——它只当**类型契约**用（L9 设计原话：「包本身降级为类型契约 + dev 解析体」）。运行时那份由宿主给 |

**② 真因：宿主供给的那份是「构建产物」，源码改了没重建。**

- 供给物 = `packages/linkdesk-ui/dist/index.js`（壳仓 workspace 包，`node_modules/@linkdesk/ui` 是指向它的软链）。
- 它的 `src` 只有一行 `export * from "@shared/…"`——**组件源码单一真源就是壳的 `src/components/shared/`**，dist 是 `npm run build -w @linkdesk/ui` 出来的**产物**（`.gitignore:3 dist/` 已忽略 ⇒ 是产物不是源码）。
- dev 轨道**没有任何"保鲜"逻辑**；而 `npm run check` 只做类型检查与门禁断言，**不构建**。⇒ 改了 `src/components/shared/**` 而没重建 dist，dev 里就看不到改动。**本次正是如此。**
- 🔵 对照：**打包轨道有保鲜**——`scripts/build-pool-vendor.mjs:54-63` 明写「ui 包 dist 保鲜（#123 内聚）：vendor 入口 = workspace `@linkdesk/ui` 的 dist/index.js」，并在 `src` 比 `dist` 新时**自动 `npm run build --workspace @linkdesk/ui`**。所以**生产上不需要谁去操心**：随下一次壳发版，vendor 轨道自动带上这个修复，**已装的 serial-monitor（1.0.21）零发版就吃到**——用户记忆中「软件更新一次、所有插件都受益」的设计**成立且正在生效**。

**③ 补救（已做）**：`npm run ui:build`（= `npm run build -w @linkdesk/ui`）重建 dist；并已把它**接进 `npm run dev` 与 `npm run electron:dev` 的启动链**（2026-09-27），下次改共享组件不会再撞这个坑。CLAUDE.md 开发命令段同笔补了说明。

> 🔴 一句话教训：**「集中供给」的供给物是构建产物**——改壳共享组件后，dev 轨道必须手动重建一次。判据 = 看 `packages/linkdesk-ui/dist/index.css` 有没有你新加的规则（CSS 类名不压缩，比 JS 里找函数名可靠得多，JS 会压缩改名）。

## 六、边界与遗留

- **同类消费者普查（用户问的「其他地方」）**：本仓 ＋ 官方插件仓 `E:/linkdesk-plugins` 里，`Combobox` 的消费者**只有一处**——`serial-monitor/src/components/ControlPanel/BaudInput.tsx`（行 19）。`SelectBox`（只有下拉、正则取值）整块触发器是 `<button>`，**不存在本缺陷**；`Select`/`Input` 等其余共享控件与此形态无关。
- **未来「双形态共存」的判据（用户提的那条）已落**：新组件若也要「可输入 ＋ 可下拉」，**直接用 `Combobox`，不要照抄视觉手搓一份**——本缺陷的完整成因就是「照抄了视觉、没抄交互骨架」。这条同 `SelectBox` → `Combobox` 的历史教训。
- ⏳ **未实机验收**：机械面全绿，但点击手感/光标形态只有真实浏览器里能判（jsdom 不实现「mousedown 默认聚焦」等默认动作，测试里凡依赖聚焦链的路径都由被测代码自己驱动——这一点已在测试注释里写明，免得后人误读为「浏览器行为已覆盖」）。
- **发版时的连带**：`@linkdesk/ui` 与壳**同号锁步**（`E6#124`）——发版时随壳一起 bump 到同号。**插件仓不需要跟版**：本件插件侧零代码改动，且 `@linkdesk/ui` 由宿主集中供给、插件 bundle 里是裸 import（实证见 §五）⇒ serial-monitor 停在自己的 1.0.21 也能吃到修复。

> **同类先例（同日同族）**：[标签 tooltip 印内部 id.md](标签tooltip印内部id.md)、[悬浮面板提示条没进收编.md](悬浮面板提示条没进收编.md)——三件都是「用户看一眼就发现的表面小事，根因都在**一处没人清点过的抽象层**」。
