/**
 * CM6 行装饰系统——E6#87b 从 src/index.tsx 搬出（只搬不改）。
 * 三色行装饰（received/sent/system）+ 时间戳前缀灰色标记。模块级 StateField 单一属主。
 */

import { Decoration, EditorView } from "@codemirror/view";
import { StateField, StateEffect, RangeSet } from "@codemirror/state";

export const addLineDeco = StateEffect.define<{ from: number; cls: string }>();
export const addTimestampMark = StateEffect.define<{ from: number; to: number }>();
export const clearAllDecos = StateEffect.define();

export const lineDecoField = StateField.define<RangeSet<Decoration>>({
  create() {
    return RangeSet.empty;
  },
  update(decos, tr) {
    let updated = decos.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(clearAllDecos)) {
        updated = RangeSet.empty;
      }
      if (e.is(addLineDeco)) {
        const d = Decoration.line({ class: e.value.cls });
        updated = updated.update({ add: [d.range(e.value.from)] });
      }
    }
    return updated;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/* ---- 时间戳前缀灰色装饰 ---- */

export const timestampMarkField = StateField.define<RangeSet<Decoration>>({
  create() { return RangeSet.empty; },
  update(marks, tr) {
    let updated = marks.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(clearAllDecos)) {
        updated = RangeSet.empty;
      }
      if (e.is(addTimestampMark)) {
        const d = Decoration.mark({ class: "cm-timestamp" });
        updated = updated.update({ add: [d.range(e.value.from, e.value.to)] });
      }
    }
    return updated;
  },
  provide: (f) => EditorView.decorations.from(f),
});
