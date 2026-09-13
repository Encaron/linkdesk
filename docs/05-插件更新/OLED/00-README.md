# OLED 模拟器

> **普通插件** | **Canvas 逐像素渲染——模拟 OLED 屏幕显示。** 旧「市场插件 / 05-版本更新」标记作废（2026-09-13 重组）。
> 照抄 E1 串口服务模式——主进程 I2C + 渲染进程 Canvas。

---

## 定位

| | |
|---|---|
| 类型 | **市场插件**——用户在 Marketplace 按需安装 |
| 前提 | E3 架构完工 + E1 串口服务模板 |
| 涉及架构改动 | I2C 需要 Electron 主进程服务——和 E1 步 2 串口服务完全相同的模式，不是新架构 |
| 对标 | 嵌入式调试工具——在电脑上看设备 OLED 屏幕当前画面 |

---

## 概念

嵌入式开发常见场景：设备有一块 OLED 屏幕（128×64 像素），通过 I2C 连接 MCU。调试时需要看到屏幕当前显示内容——OLED 模拟器在电脑上逐像素渲染。

```
┌──────────────────────────────┐
│  OLED 模拟器                  │
│  ┌──────────────────────────┐│
│  │  ██    ██  ████  ██     ││  ← 128×64 Canvas 逐像素
│  │  █ █  █ █  █     █ █    ││
│  │  █  █ █  █  ███   █  █  ││
│  │  █   ██  █  █     █   █ ││
│  │  ██    ██  ████  ██   █ ││
│  └──────────────────────────┘│
│  亮度: ████████░░ 80%        │
│  [截图] [导出]                │
└──────────────────────────────┘
```

---

## 技术方案

```
MCU（硬件）
  │ I2C 总线
  ▼
I2C-USB 适配器
  │
  ▼
主进程（i2c-service.ts）
  │ IPC：i2c 数据流
  ▼
壳 WebView（oled-plugin）
  Canvas 2D → requestAnimationFrame → 逐像素渲染
```

- I2C 通信走主进程——跟串口服务完全相同的模式（E1 步 2 模板）
- Canvas 渲染在渲染进程——`requestAnimationFrame` 驱动，~60fps
- 像素数据格式：`Uint8Array`（128×64÷8 = 1024 字节/帧）

---

## plugin.json

```json
{
  "name": "OLED 模拟器",
  "version": "1.0.0",
  "icon": "device-camera",
  "iconSource": "codicon",
  "description": "OLED 屏幕模拟——128×64 Canvas 逐像素渲染",
  "entry": "index.tsx",
  "contributes": {
    "configuration": {
      "oled.i2cAddress": {
        "type": "string",
        "default": "0x3C",
        "description": "I2C 设备地址"
      },
      "oled.brightness": {
        "type": "number",
        "default": 80,
        "minimum": 0,
        "maximum": 100,
        "description": "模拟亮度"
      }
    }
  }
}
```

---

## 任务清单（~200 行）

| # | 任务 | 行数 | 独立验证 |
|:--:|------|:--:|------|
| 1 | `plugin.json` + `index.tsx` 骨架——Canvas 128×64 逐像素渲染 | ~50 | 静态测试图案正确显示 |
| 2 | `electron/services/i2c-service.ts`——主进程 I2C 读写 | ~50 | `i2c-bus` 检测到设备 |
| 3 | I2C 数据流 IPC——主进程 → 插件 WebView | ~30 | I2C 数据到达 → Canvas 实时更新 |
| 4 | 控制面板——亮度滑块 / 截图 / 导出 | ~40 | 截图保存为 PNG |
| 5 | `preload-shell.ts` 暴露 `window.linkdesk.i2c.*` | ~30 | 插件侧能调 `window.linkdesk.i2c.read()` |

---

## 底座依赖

| 底座 | 来源 | OLED 用到什么 |
|------|:--:|------|
| 多 WebView | E3a | OLED = 独立 WebContentsView |
| FileService | E2c | 截图导出 |
| 主题引擎 | E3b | Canvas 颜色走 CSS 变量 |
| 串口服务模板 | E1 步 2 | I2C 服务照抄串口模式 |

---

> **← 官方插件索引：** `../00-README.md`
> **← 同文件夹（原出处）：** 从 `插件_工作台与OLED_暂定/` 拆分——工作台部分已迁移到 `01-卡片工作台/`（独立蓝图 7 份 MD）
