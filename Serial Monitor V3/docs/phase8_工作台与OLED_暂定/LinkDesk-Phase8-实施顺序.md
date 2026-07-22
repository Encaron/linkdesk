# Phase 8 — 实施顺序

> 2026-07-22。从 [LinkDesk-Phase8-设计.md](./LinkDesk-Phase8-设计.md) 提炼。
> **前提：** Phase 7 全部完成（多 WebView + 文件树 + 主题/语言 + Profile + 抛光）。
> **性质：** 纯消费者插件——零框架改动。

---

## 前置条件

```
Phase 7 全部完成：
  ✅ 多 WebView 进程隔离
  ✅ 文件树 + 编辑
  ✅ 主题/语言引擎 + 浏览器
  ✅ Profile + 激活 + 通知 + 抛光
```

---

## 第 1 批：8a — 卡片工作台（~400 行）

| 步 | 任务 | 行数 |
|:--:|------|:--:|
| 1 | CardRegistry 渲染引擎——react-grid-layout 集成 | +120 |
| 2 | 内置卡片类型：仪表盘 / 滑块 / 数值 / 折线图 | +150 |
| 3 | 数据管道消费端——DataDispatch → 卡片 | +80 |
| 4 | 卡片拖拽/缩放/添加/删除 | +50 |

---

## 第 2 批：8b — OLED（~200 行）

| 步 | 任务 | 行数 |
|:--:|------|:--:|
| 5 | OLED 视图插件——注册 + 标签页 + keep-alive | +50 |
| 6 | I2C 通信层（Rust + TS） | +80 |
| 7 | OLED 像素渲染（Canvas） | +70 |

---

## 验证

```
8a:
  终端发数据 → DataDispatch 解析 → 卡片实时更新
  拖拽卡片 → 重新排列 → F5 刷新 → 布局保持
  暗色/亮色主题 → 卡片颜色跟随

8b:
  I2C → OLED 像素正确渲染
  Canvas 帧率 >= 30fps
```

---

## 相关文档

- [LinkDesk-Phase8-设计.md](./LinkDesk-Phase8-设计.md) — 主设计文档
- [LinkDesk-Phase7-设计.md](../phase7_多WebView与编辑能力_暂定/LinkDesk-Phase7-设计.md) — Phase 8 的前置条件
