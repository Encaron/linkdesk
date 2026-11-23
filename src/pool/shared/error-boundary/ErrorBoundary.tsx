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
import FallbackFace, { type FallbackScale } from "../fallback/FallbackFace";

interface Props {
  children: ReactNode;
  /** 插件 ID——崩溃时用于显示 "「终端」已崩溃" */
  pluginId?: string;
  /** 容器尺度（2026-11-24 降级脸家族）：侧栏 section 传 panel；缺省 full */
  scale?: FallbackScale;
  /** 自定义 fallback UI。不传则用内置 crash 脸（FallbackFace） */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  /** 崩溃发生时间（诊断详情行） */
  errorAt: string;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorAt: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorAt: new Date().toISOString() };
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

      const name = this.props.pluginId ?? i18n.t("应用名");
      const error = this.state.error;
      return (
        <FallbackFace
          variant="crash"
          scale={this.props.scale}
          title={i18n.t("「{{name}}」已崩溃", { name })}
          description={i18n.t("视图渲染出错，可以重试；反复出现请展开诊断信息反馈。")}
          onRetry={this.handleRetry}
          detail={[
            { label: i18n.t("插件 id"), value: this.props.pluginId ?? "—" },
            { label: i18n.t("错误消息"), value: error?.message ?? String(error) },
            { label: i18n.t("发生时间"), value: new Date(this.state.errorAt).toLocaleString() },
          ]}
        />
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
