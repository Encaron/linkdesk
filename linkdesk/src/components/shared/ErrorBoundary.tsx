import { Component, type ReactNode } from "react";
import i18n from "../../i18n";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          height: "100%", color: "var(--text-muted)", fontSize: 13,
        }}>
          {i18n.t("模块加载失败，请重启应用")}
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
