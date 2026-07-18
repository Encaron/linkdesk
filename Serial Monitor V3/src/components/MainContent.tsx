import type { ViewId } from "../App";
import TerminalView from "./views/TerminalView";
import WorkspaceView from "./views/WorkspaceView";
import SettingsView from "./views/SettingsView";
import "./MainContent.css";

interface MainContentProps {
  activeView: ViewId;
}

function MainContent({ activeView }: MainContentProps) {
  return (
    <div className="main-content">
      {activeView === "terminal" && <TerminalView />}
      {activeView === "workspace" && <WorkspaceView />}
      {activeView === "settings" && <SettingsView />}
    </div>
  );
}

export default MainContent;
