import type { ViewId } from "../App";
import TerminalView from "./views/TerminalView";
import ErrorBoundary from "./shared/ErrorBoundary";
import WorkspaceView from "./views/WorkspaceView";
import SettingsView from "./views/SettingsView";
import "./MainContent.css";

interface MainContentProps {
  activeView: ViewId;
}

function MainContent({ activeView }: MainContentProps) {
  return (
    <div className="main-content">
      {activeView === "terminal" && <ErrorBoundary><TerminalView /></ErrorBoundary>}
      {activeView === "workspace" && <WorkspaceView />}
      {activeView === "settings" && <SettingsView />}
    </div>
  );
}

export default MainContent;
