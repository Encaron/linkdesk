/**
 * floatingPanel 声明者完整性测试——E5.8#39.5 子项 D 首批/第二声明者验证。
 * 覆盖两插件（settings 首批 + floating-panel-demo 第二）：
 *   ① 声明形状（floatingPanel.viewId 非空字符串）
 *   ② viewId ↔ contributes.views 关联（必须引用已声明视图——声明寻址前提）
 *   ③ render 文件物理存在（viewRenderModules glob 是构建时扫描——render 必须落在 src/views/**，
 *      文件缺失则 parseContributions 静默跳过 → 声明失效，实机无右键入口）
 *   ④ 容器 location=auxiliarybar（LinkDesk 无此区域渲染——真不可见 + _viewIndex 可寻址）
 *   ⑤ 端到端：真实 manifest registerViewPlugin → getFloatingPanelViewId 返回声明 viewId
 *     （子项 C 注入条件 = 此函数非 null——声明制落地验证）
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { registerViewPlugin, getFloatingPanelViewId } from "./viewRegistry";
import { normalizePath } from "../core/utils/path/pathUtils";
import type { PluginManifest } from "../core/api/types";

/** 测试运行 cwd = 项目根（E:/linkdesk）——相对路径直指插件目录 */
const PROJECT_ROOT = resolve(__dirname, "../..");

/** 声明者清单——[描述, pluginId, plugin.json 相对项目根] */
const DECLARERS: Array<{ label: string; pluginId: string; jsonPath: string }> = [
  { label: "settings（首批声明者——#38 Ctrl+, 弹面板）", pluginId: "settings", jsonPath: "plugins/builtin/settings/plugin.json" },
  { label: "floating-panel-demo（第二声明者验证载体）", pluginId: "floating-panel-demo", jsonPath: "plugins/user/floating-panel-demo/plugin.json" },
];

interface DeclarerContributes {
  floatingPanel?: { viewId?: unknown };
  views?: Record<string, Array<{ id: string; render?: string }>>;
  viewsContainers?: Record<string, { location?: string }>;
}

describe("floatingPanel 声明者完整性（E5.8#39.5 子项 D）", () => {
  for (const { label, pluginId, jsonPath } of DECLARERS) {
    describe(label, () => {
      const manifest = JSON.parse(readFileSync(resolve(PROJECT_ROOT, jsonPath), "utf-8")) as PluginManifest;
      const contributes = manifest.contributes as DeclarerContributes | undefined;
      const viewId = contributes?.floatingPanel?.viewId;
      const containerId = Object.keys(contributes?.views ?? {})[0];
      const viewDef = contributes?.views?.[containerId]?.find((v) => v.id === viewId);

      it("声明 floatingPanel.viewId 为非空字符串", () => {
        expect(typeof viewId).toBe("string");
        expect((viewId as string).length).toBeGreaterThan(0);
      });

      it("viewId 引用 contributes.views 中已声明的视图 id（声明寻址前提）", () => {
        const allViewIds = Object.values(contributes?.views ?? {}).flat().map((v) => v.id);
        expect(allViewIds).toContain(viewId);
      });

      it("该视图 render 文件物理存在且落在 src/views/**（glob 构建时扫描——缺失则声明失效）", () => {
        expect(viewDef?.render, `视图 "${String(viewId)}" 必须声明 render`).toBeTruthy();
        const renderFile = resolve(PROJECT_ROOT, jsonPath.replace(/\/plugin\.json$/, ""), viewDef?.render as string);
        // normalizePath 归一化后断言 glob 路径形态（src/views 子目录）——池/loader 双 glob 均按此扫描
        expect(normalizePath(renderFile).includes("src" + "/views" + "/")).toBe(true);
        expect(existsSync(renderFile), `render 文件缺失：${renderFile}`).toBe(true);
      });

      it("容器 location=auxiliarybar（LinkDesk 无此区域渲染——真不可见 + _viewIndex 可寻址）", () => {
        expect(contributes?.viewsContainers?.[containerId]?.location).toBe("auxiliarybar");
      });

      it("端到端：真实 manifest 注册 → getFloatingPanelViewId 返回声明 viewId（子项 C 注入条件）", () => {
        const disposer = registerViewPlugin({ pluginId, manifest });
        try {
          expect(getFloatingPanelViewId(pluginId)).toBe(viewId);
        } finally {
          disposer();
        }
      });
    });
  }
});
