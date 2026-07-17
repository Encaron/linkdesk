---
name: dev-environment
description: V3 开发环境——需要装什么、占多少空间
metadata:
  type: reference
---

# V3 开发环境

## 你需要装的东西

| 工具 | 用途 | 大小 | 安装方式 |
|------|------|:--:|------|
| **Node.js LTS** | npm、Vite 开发服务器、React 编译 | ~100MB | [nodejs.org](https://nodejs.org) 下载 LTS 安装包 |
| **Rust (rustup)** | Tauri 后端编译 | **~1.5GB** | [rustup.rs](https://rustup.rs) 下载 rustup-init.exe |
| **Microsoft Visual C++ Build Tools** | Rust 在 Windows 上编译需要 MSVC 链接器 | ~2-3GB | 用 rustup-init 装完 Rust 后，它会提示装 Visual Studio Build Tools，选"Desktop development with C++" workload |

## 你不需要装的

| 不需要 | 为什么 |
|------|------|
| .NET SDK / Runtime | V3 是 Tauri，不是 WPF |
| WebView2 | Win11 自带。Win10 也基本推送了 |
| Visual Studio IDE | 只要 Build Tools 就行——命令行编译，不需要图形化 IDE |
| Python / Java / 任何其他运行时 | 不需要 |

## 总空间占用

**约 3-4GB。** 和 V2 的 .NET 8 SDK（~2GB+）量级接近，稍微大一点——大头在 MSVC Build Tools。

## 和 V2 的对比

| | V2 | V3 |
|------|:--:|:--:|
| 运行时 | .NET SDK 8.0（~2GB） | Node.js（~100MB）+ Rust（~1.5GB） |
| 编译工具 | dotnet CLI | npm + cargo |
| 是否需要 IDE | 不需要（但装了占了也不知道） | 不需要 |
| 最终 exe | ~2MB（框架依赖）+ 用户需装 .NET Runtime | ~5MB（Evergreen）+ 系统自带 WebView2 |

## 以后真正开始写代码时才装

现在是设计阶段，一行代码没写。等方案定稿、开始第一次 `npm create tauri-app` 时再装。AI 会一步步告诉你装什么、怎么装。
