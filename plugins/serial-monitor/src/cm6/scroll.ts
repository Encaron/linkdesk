/**
 * CM6 智能滚底插件——E6#87b 从 src/index.tsx 搬出（只搬不改）。
 * 用户停在底部时新数据自动跟随；用户上滚后不打扰。
 */

import { EditorView, ViewPlugin, ViewUpdate, type PluginValue } from "@codemirror/view";
import { SCROLL_AT_BOTTOM_TOLERANCE } from "../constants";

class ScrollTracker implements PluginValue {
  private atBottom = true;

  constructor(view: EditorView) {
    view.scrollDOM.addEventListener("scroll", () => {
      const dom = view.scrollDOM;
      this.atBottom = dom.scrollHeight - dom.scrollTop - dom.clientHeight < SCROLL_AT_BOTTOM_TOLERANCE;
    }, { passive: true });
  }

  update(update: ViewUpdate) {
    if (update.docChanged && this.atBottom) {
      const view = update.view;
      requestAnimationFrame(() => {
        const pos = view.state.doc.length;
        view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: "end" }) });
      });
    }
  }
}

export const scrollTracker = ViewPlugin.fromClass(ScrollTracker);
