/**
 * ErrorBoundary——池侧版（E5.7#20，从 src/components/shared/ErrorBoundary.tsx 迁入）。
 *
 * 与壳侧版同构：插件崩溃安全气囊——捕获后兜底显示 crash 界面 + 重试按钮。
 * 池侧 i18n 由 pool-main.tsx 模块级初始化（E5.6#10f）——i18n.t 兜底文案可用。
 *
 * 🔴 Path B：池不 import 壳 components 目录——池侧消费方
 *    （MainZone/PluginComponent/PoolStatusBarComponent/PoolSectionStack/PoolToolbarSlot）
 *    一律 import 本文件；壳侧版（components/shared/ErrorBoundary.tsx）唯一消费方
 *    ShellPluginComponent 已随 per-tab 遗留删除（E5.7#40 连带）——本文件是唯一版本。
 *
 * AI 友好：componentDidCatch 输出完整 error stack 到控制台。
 */

import { Component, type ReactNode, type ErrorInfo } from "react";
import i18n from "../../../i18n";

interface Props {
  children: ReactNode;
  /** 插件 ID——崩溃时用于显示 "「终端」已崩溃" */
  pluginId?: string;
  /** 自定义 fallback UI。不传则用内置 crash 界面（pluginId + 重试按钮） */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // 完整 stack 输出控制台——AI 调试友好
    const label = this.props.pluginId ? `[${this.props.pluginId}]` : "[pool]";
    console.error(
      `ErrorBoundary${label} caught error:`,
      error,
      "\nComponent stack:",
      errorInfo.componentStack,
    );
  }

  handleRetry = () => {
    // 重置 error state → React 重新渲染 children
    // 若是瞬时错误（数据竞态等）则恢复；若错误仍存在则再次捕获
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const name = this.props.pluginId ?? i18n.t("应用");
      return (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 12,
          color: "var(--text-muted)",
          fontSize: "var(--font-size-md)", /* E5.8 Phase 12 #171：13→md */
          userSelect: "none",
        }}>
          <span>{i18n.t("「{{name}}」已崩溃", { name })}</span>
          <button
            onClick={this.handleRetry}
            style={{
              padding: "4px 16px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-card)",
              color: "var(--text-primary)",
              cursor: "pointer",
              fontSize: "var(--font-size-sm)", /* E5.8 Phase 12 #171：12→sm */
            }}
          >
            {i18n.t("重试")}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
