/**
 * CM6 搜索高亮装饰系统——E6#87b 从 src/index.tsx 搬出（只搬不改）。
 */

import { Decoration, EditorView } from "@codemirror/view";
import { StateField, StateEffect, RangeSet } from "@codemirror/state";

export const setSearchDecos = StateEffect.define<{ matches: { from: number; to: number }[]; current: number }>();
export const clearSearchDecos = StateEffect.define();

export const searchDecoField = StateField.define<RangeSet<Decoration>>({
  create() { return RangeSet.empty; },
  update(decos, tr) {
    let updated = decos.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(clearSearchDecos)) {
        updated = RangeSet.empty;
      }
      if (e.is(setSearchDecos)) {
        updated = RangeSet.empty;
        const marks: { from: number; to: number; value: Decoration }[] = [];
        e.value.matches.forEach((m, i) => {
          const isCurrent = i === e.value.current - 1;
          marks.push({
            from: m.from, to: m.to,
            value: Decoration.mark({ class: isCurrent ? "cm-search-current" : "cm-search-match" }),
          });
        });
        updated = updated.update({ add: marks });
      }
    }
    return updated;
  },
  provide: (f) => EditorView.decorations.from(f),
});
