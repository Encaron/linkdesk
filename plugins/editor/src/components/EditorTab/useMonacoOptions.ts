/**
 * Monaco 编辑器选项的异步加载与热更新（E4V#40q，E6#87c 拆自 EditorTab.tsx）。
 *
 * 两条通道：① 初次加载完成后主动推给已创建的 editor 实例（editor 创建时 options 还是
 * undefined，之后 useState 更新不触发 editor 重建）；② 配置变更订阅 → 运行时 updateOptions。
 */
import { useEffect, useState } from "react";
import type { RefObject } from "react";
import type { EditorViewHandle } from "../../views/EditorView";
import { buildMonacoOptions } from "./buildMonacoOptions";

const lk = window.linkdesk;

export function useMonacoOptions(editorViewRef: RefObject<EditorViewHandle>): Record<string, unknown> | undefined {
  // E4V#40q——编辑器选项状态（异步加载配置）
  const [editorOptions, setEditorOptions] = useState<Record<string, unknown>>();

  // E4V#40q——加载编辑器配置 + 初始 apply（修复异步加载后 editor 未更新）
  useEffect(() => {
    buildMonacoOptions().then((opts) => {
      setEditorOptions(opts);
      // 🔴 初始 load 完成——主动推给已创建的 editor 实例
      // editor 创建时 options={undefined}，之后 useState 更新不触发 editor 重建
      editorViewRef.current?.updateOptions(opts);
    });
  }, [editorViewRef]);

  // E4V#40q——订阅配置变更 → 运行时 updateOptions，无需重建 editor
  useEffect(() => {
    const unsubscribe = lk.configuration.onChange("", async () => {
      const opts = await buildMonacoOptions();
      editorViewRef.current?.updateOptions(opts);
    });
    return unsubscribe;
  }, [editorViewRef]);

  return editorOptions;
}
