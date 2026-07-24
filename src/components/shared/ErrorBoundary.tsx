import { Component, type ReactNode, type ErrorInfo } from "react";
import i18n from "../../i18n";

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

/**
 * ErrorBoundary — 插件崩溃安全气囊。
 *
 * 单 WebView 模式下，一个插件崩溃会带崩整个 WebView。
 * ErrorBoundary 捕获后兜底显示 crash 界面 + 重试按钮，其余插件不受影响。
 * E3 多进程后升级为 per-WebView 进程隔离，此组件作为外壳兜底。
 *
 * AI 友好：componentDidCatch 输出完整 error stack 到控制台。
 */
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
    const label = this.props.pluginId ? `[${this.props.pluginId}]` : "[shell]";
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
          fontSize: 13,
          userSelect: "none",
        }}>
          <span>{i18n.t("「{{name}}」已崩溃", { name })}</span>
          <button
            onClick={this.handleRetry}
            style={{
              padding: "4px 16px",
              border: "1px solid var(--border-normal)",
              borderRadius: 3,
              background: "var(--bg-button)",
              color: "var(--text-normal)",
              cursor: "pointer",
              fontSize: 12,
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
