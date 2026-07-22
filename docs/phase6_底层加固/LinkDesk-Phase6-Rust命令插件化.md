# Phase 6d — Rust 命令插件化

> 2026-07-22。从 [LinkDesk-Phase6-设计.md](./LinkDesk-Phase6-设计.md) 派生。
>
> **性质：** Phase 6 底层加固的第四层。**不做脚本、不做代码生成——只做三件事：Tauri 原生 PluginBuilder + 平表注册 + Cargo.toml 每插件一行。**

---

## 一、设计原则——防止藕断丝连

### 1.1 现在的病根

```
serial.rs 在 src-tauri/src/      → 物理位置在核心
mod serial; 在 lib.rs             → 编译单元在核心
serialport = "4" 在 Cargo.toml   → 依赖在核心
8 个串口命令在 invoke_handler    → 注册在核心
```

**病根：** 不是"有些串口代码没搬走"——是核心和终端共享同一个模块边界。改终端 -> 动核心 -> 全崩。

### 1.2 原则

| 原则 | 判据 |
|------|------|
| **隔离** | 终端插件的 Rust 代码崩了 → 其他插件不受影响 |
| **平表** | `lib.rs` 里每个插件只占一行 `builder = builder.plugin(init())`——没有循环、没有宏、没有间接层 |
| **无生成** | 不加 build.rs / 脚本 / 代码生成——一层的"自动化"下多了一层全局耦合，崩了全陪葬 |
| **Cargo 原生** | 每个插件独立的 crate——`Cargo.toml` 管自己的依赖，`serialport` 只在终端插件里 |
| **从不自动猜** | 核心不知道有多少插件、不知道它们叫什么——不扫 `plugin.json`、不读目录、不推演 |

---

## 二、机制——Tauri 原生 PluginBuilder

### 2.1 插件 crate 规范

```
plugins/<id>/rust/
  Cargo.toml        ← serialport = "4" 在这里，不在核心
  src/
    lib.rs          ← pub fn init() -> TauriPlugin<Wry>
    commands.rs     ← #[tauri::command] fn open_source(...) 等
    state.rs        ← 插件专属状态
```

### 2.2 lib.rs——平表

```rust
// src-tauri/src/lib.rs

pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .register_asynchronous_uri_scheme_protocol("plugin", ...)
        .invoke_handler(tauri::generate_handler![
            // 核心命令——不属于任何插件
            plugins::list_plugin_dirs,
            plugins::list_disabled_plugin_dirs,
            plugins::install_plugin,
            plugins::uninstall_plugin,
            plugins::reinstall_plugin,
            plugins::read_plugin_manifest,
            // Phase 6c FileService 命令加这里
            // file_service::list_dir,
            // file_service::read_file,
        ]);

    // ──── 插件 Rust 命令注册 ────
    // 一个插件一行。没有循环、没有宏、没有扫描。
    // 互相独立——坏一个不影响其他的编译。
    #[cfg(feature = "plugin-terminal")]
    { builder = builder.plugin(linkdesk_plugin_terminal::init()); }

    // #[cfg(feature = "plugin-oled")]
    // { builder = builder.plugin(linkdesk_plugin_oled::init()); }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**为什么是平表：**
- 3 个插件 = 3 行。30 个插件 = 30 行。逻辑复杂度不随数量增长。
- 坏一行 → 注释掉 → 其他照常。不像循环——一个崩全崩。
- 新 AI 一眼看懂模式：加新插件 = 1 行 `#[cfg]` + 1 行 `.plugin(init())`。

### 2.3 Cargo.toml——每插件一行

```toml
# src-tauri/Cargo.toml

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-fs = "2"
tauri-plugin-dialog = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["sync", "rt"] }
encoding_rs = "0.8"

# ❌ 删除：serialport = "4"

# ──── 插件 Rust crate（optional = 不启用 feature 就不编译）────
linkdesk-plugin-terminal = { path = "../../plugins/terminal/rust", optional = true }
# linkdesk-plugin-oled = { path = "../../plugins/oled/rust", optional = true }

[features]
default = ["plugin-terminal"]
plugin-terminal = ["dep:linkdesk-plugin-terminal"]
# plugin-oled = ["dep:linkdesk-plugin-oled"]
```

### 2.4 终端插件 Rust crate

```toml
# plugins/terminal/rust/Cargo.toml

[package]
name = "linkdesk-plugin-terminal"
version = "0.1.0"
edition = "2021"

[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serialport = "4"              # ← 串口依赖在这里！不在核心！
encoding_rs = "0.8"
```

```rust
// plugins/terminal/rust/src/lib.rs

use tauri::plugin::{Builder as PluginBuilder, TauriPlugin};

mod commands;
mod state;

pub fn init() -> TauriPlugin<tauri::Wry> {
    PluginBuilder::new("terminal")
        .invoke_handler(tauri::generate_handler![
            commands::list_ports,
            commands::get_source_status,
            commands::open_source,
            commands::close_source,
            commands::send_data,
            commands::send_text,
            commands::set_dtr,
            commands::set_rts,
        ])
        .setup(|app, _api| {
            app.manage(state::create_state());
        })
        .build()
}
```

**关键：** `PluginBuilder` 是 Tauri v2 原生的——和 `tauri_plugin_fs::init()`、`tauri_plugin_dialog::init()` 完全一样的模式。核心把终端插件和文件系统插件同等对待——不区别。

---

## 三、为什么不做脚本

| | 脚本方案 | 平表方案 |
|------|:--:|:--:|
| 加新插件 | 跑 `npm run generate:rust` | lib.rs 加 1 行 `#[cfg]`，Cargo.toml 加 2 行 |
| 一个插件坏了 | 脚本扫到它 → 可能全崩（看脚本怎么处理错误） | 只那个插件的 `#[cfg]` 行编译不过——其他不受影响 |
| 20 个插件后 | 脚本可能变成 200 行 | 平表 60 行——每插件严格 3 行 |
| 和今天的串口残留同病？ | ✅ 是——脚本是全局耦合点 | ❌ 不是——互不干扰 |

**V2.6 的根因就是"一个 bug 多个地方出现"。** 平表方案：每个插件独立编译，坏一个不影响全部。脚本方案：脚本坏了全局陪葬——和 `SerialContext` 在 core 里是一个病。

---

## 四、实施步骤

### 步 1：建 terminal 插件 Rust crate 骨架（~30 行新建）

**文件：**
- `plugins/terminal/rust/Cargo.toml`（新建，~12 行）
- `plugins/terminal/rust/src/lib.rs`（新建，~20 行）

**做什么：**
1. 建目录结构
2. `Cargo.toml` 依赖 `tauri`、`serde`、`serialport`、`encoding_rs`
3. `lib.rs` 写 `pub fn init() -> TauriPlugin<Wry>` 函数签名（函数体留空）

**验证：**
```bash
cd plugins/terminal/rust && cargo check
# → 零错误
```

### 步 2：搬迁 serial.rs → commands.rs + state.rs（纯搬家）

**文件：**
- `src-tauri/src/serial.rs` → `plugins/terminal/rust/src/commands.rs`（~300 行）
- 状态结构体 + `create_state()` → `plugins/terminal/rust/src/state.rs`（~50 行）
- `plugins/terminal/rust/src/lib.rs` → 填入 `init()` 函数体

**做什么：**
1. 复制 `serial.rs` 全部内容
2. 提取状态管理到 `state.rs`
3. 填充 `init()` ——见上方的完整代码
4. 6b 的术语迁移（`open_port` → `open_source` 等）照常应用
5. **不改逻辑——函数签名、参数、返回值全部保留**

**预计：** +392/−392 行（搬家，净增 ~20 行 glue code）

**验证：**
```bash
cd plugins/terminal/rust && cargo check
# → 零错误
```

### 步 3：更新主 Cargo.toml + lib.rs（~15 行改动）

**文件：**
- `src-tauri/Cargo.toml`
- `src-tauri/src/lib.rs`

**做什么——Cargo.toml：**
1. 删 `serialport = "4"`
2. 加 optional dep + feature：`linkdesk-plugin-terminal = { path = "...", optional = true }`
3. 加 `[features]` section

**做什么——lib.rs：**
1. 删 `mod serial;`
2. 删 8 个串口命令条目
3. 删 `.manage(serial::create_state())`
4. 加 `#[cfg]` 平表行

**预计：** +15/−15 行

**验证：**
```bash
cd src-tauri && cargo check
# → 零错误
```

### 步 4：更新 plugin.json（~3 行）

```json
// plugins/terminal/plugin.json — 加一行
{
  "id": "terminal",
  "contributes": {
    "rustCommands": true
  }
}
```

**`rustCommands: true` 的作用：** 人类可读标记——"这个插件有 Rust 代码"。不被脚本读取、不被自动扫描。只是文档。

### 步 5：全量验证

```bash
cd linkdesk/
npx tsc --noEmit          # TS 零错误
npx vitest run            # 测试全过

cd src-tauri/
cargo check               # Rust 零错误
cargo build               # release build

cd ../
npx tauri dev             # 完整桌面应用
```

**手动验证：** 终端打开/关闭/切 COM/HEX/时间戳/发送/F5——全不变。

**清理验证：**
```bash
grep "serialport" src-tauri/Cargo.toml    # → 零结果 ✅
grep "mod serial" src-tauri/src/lib.rs    # → 零结果 ✅
ls src-tauri/src/serial.rs                # → 不存在 ✅
grep "serialport" plugins/terminal/rust/Cargo.toml  # → 存在 ✅
```

---

## 五、验收标准

### 5.1 功能等价

```
所有串口功能不变。tsc 零错误。vitest 全过。cargo check 零错误。
```

### 5.2 依赖隔离

```
serialport 在 src-tauri/Cargo.toml → 零结果 ✅
serialport 在 plugins/terminal/rust/Cargo.toml → 唯一出现位置 ✅
serial.rs 在 src-tauri/src/ → 零结果 ✅
```

### 5.3 插件注册互不干扰

```
删除 #[cfg(feature = "plugin-terminal")] 行 → cargo check → 终端命令全部消失
恢复该行 → cargo check → 终端命令全部回来
→ 其他插件命令和核心命令不受影响
```

### 5.4 新 AI 可推导

```
新 AI 读 lib.rs：
  看到每个插件一行 #[cfg] + .plugin(init())
  → 推导模式：加新插件 = 
    1. 建 plugins/<id>/rust/
    2. 写 init()
    3. Cargo.toml 加 optional dep + feature
    4. lib.rs 加 1 行 #[cfg]
    → 完毕。不需要文档。
```

---

## 六、不做的事

| 不做 | 理由 |
|------|------|
| build.rs 自动扫描 `plugin.json` | build.rs 改不了 Cargo features——在 Cargo 读 Cargo.toml 之后执行 |
| Node.js 脚本自动生成 | 全局耦合——脚本坏了所有插件编译不过。V2.6 模式 |
| dlopen 动态加载 | 需要 ABI 稳定 + 安全沙箱 + 跨平台测试。3 个插件不需要这个 |
| Cargo workspace | 目前 1 个子 crate——workspace 比平表多一层间接，不增加价值 |

**唯一会"自动"的事：** 新 AI 读平表就能推导怎么做。文档不是代码生成器——是模式说明。

---

## 七、和后续 Phase 的关系

### Phase 8 OLED

```
OLED 加 I2C：
  1. plugins/oled/rust/Cargo.toml → 依赖 i2c crate
  2. plugins/oled/rust/src/lib.rs → init() 注册 I2C 命令
  3. src-tauri/Cargo.toml → 加 optional dep + feature（+2 行）
  4. src-tauri/src/lib.rs → 加 1 行 #[cfg]（+1 行）
  → 完毕。serialport 不在核心，i2c 也不在。
```

### 未来 20+ 插件

```
每个插件严格 3 行：
  Cargo.toml optional dep 1 行 + feature 1 行 + lib.rs #[cfg] 1 行

20 个插件 = 平表 60 行。逻辑复杂度不随数量增长。
一个插件坏了 → 注释掉那一行 → 其他继续。
→ 和今天的串口残留零共享——互不感染。
```

---

## 八、相关文档

- [LinkDesk-Phase6-设计.md](./LinkDesk-Phase6-设计.md) — 主设计文档
- [LinkDesk-Phase6-终端归一化.md](./LinkDesk-Phase6-终端归一化.md) — 6b（TS 侧清理）
- [LinkDesk-Phase6-实施顺序.md](./LinkDesk-Phase6-实施顺序.md) — 执行计划
- [LinkDesk-Phase8-设计.md](../phase8_工作台与OLED/LinkDesk-Phase8-设计.md) — Phase 8 OLED 消费 6d 机制
