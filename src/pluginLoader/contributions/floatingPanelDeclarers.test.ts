/**
 * floatingPanel 声明者完整性测试——E5.8#39.5 子项 D 首批/第二声明者验证。
 * 覆盖两插件（settings 首批 + floating-panel-demo 第二）：
 *   ① 声明形状（floatingPanel.viewId 非空字符串）
 *   ② viewId ↔ contributes.views 关联（必须引用已声明视图——声明寻址前提）
 *   ③ render 文件物理存在（E6#17d 后壳侧不 import render——池 PluginComponent glob 构建时扫描，
 *      render 必须落在 src/views/**，文件缺失则池打开 import 失败）
 *   ④ 容器 location=auxiliarybar（LinkDesk 无此区域渲染——真不可见 + _viewIndex 可寻址）
 *   ⑤ 端到端：真实 manifest registerViewPlugin → getFloatingPanelViewId 返回声明 viewId
 *     （子项 C 注入条件 = 此函数非 null——声明制落地验证）
 *
 * 🔴 E6#99（L7 第 7.2 轮）：**settings 的源码已外移独立仓** ⇒ 它的 plugin.json 与 render 不再在仓内。
 *   本测试的**意图不变**（拿真实 manifest 验证声明自洽），只是「真实」的落点换了：
 *   ① 仓内还有源码（floating-panel-demo 夹具）→ 查盘；
 *   ② 官方插件已外移（settings）→ 读**随壳发货的种子 zip**（`bundled-plugins/settings.linkdesk-plugin`）
 *      的 plugin.json 与条目表。种子是壳仓里真实存在的那一份，不是第二份副本。**断言一条没减。**
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import JSZip from "jszip";
import { registerViewPlugin, getFloatingPanelViewId } from "./viewRegistry";
import { normalizePath } from "../../core/utils/path/pathUtils";
import type { PluginManifest } from "../../core/api/types";

/** 测试运行 cwd = 项目根（E:/linkdesk）——相对路径直指插件目录 */
const PROJECT_ROOT = resolve(__dirname, "../../..");

/** 声明者清单——[描述, pluginId, plugin.json 相对项目根] */
const DECLARERS: Array<{ label: string; pluginId: string; jsonPath: string }> = [
  // 2026-09-05 塌平单根：settings 原 plugins/builtin/settings、floating-panel-demo 原 plugins/user/floating-panel-demo
  { label: "settings（首批声明者——#38 Ctrl+, 弹面板）", pluginId: "settings", jsonPath: "plugins/settings/plugin.json" },
  { label: "floating-panel-demo（第二声明者验证载体）", pluginId: "floating-panel-demo", jsonPath: "plugins/floating-panel-demo/plugin.json" },
];

interface DeclarerContributes {
  floatingPanel?: { viewId?: unknown };
  views?: Record<string, Array<{ id: string; render?: string }>>;
  viewsContainers?: Record<string, { location?: string }>;
}

/** 从已加载的 manifest 里取本例关心的四个值（每个 it 自己取，免得依赖收集期的顺序） */
function declOf(manifest: PluginManifest) {
  const contributes = manifest.contributes as DeclarerContributes | undefined;
  const viewId = contributes?.floatingPanel?.viewId;
  const containerId = Object.keys(contributes?.views ?? {})[0];
  return { contributes, viewId, containerId, viewDef: contributes?.views?.[containerId]?.find((v) => v.id === viewId) };
}

describe("floatingPanel 声明者完整性（E5.8#39.5 子项 D）", () => {
  for (const { label, pluginId, jsonPath } of DECLARERS) {
    describe(label, () => {
      let manifest: PluginManifest;
      /** render 判据——两种形态各按自己的规矩，见每支内的注释 */
      let assertRender: (render: string) => void;

      beforeAll(async () => {
        const abs = resolve(PROJECT_ROOT, jsonPath);
        if (existsSync(abs)) {
          // ① 仓内源码树（开发夹具）：render 指向**源码**，必须落在 src/views/**
          manifest = JSON.parse(readFileSync(abs, "utf-8")) as PluginManifest;
          const base = resolve(PROJECT_ROOT, jsonPath.replace(/\/plugin\.json$/, ""));
          assertRender = (render) => {
            expect(render.includes("src/views/")).toBe(true);
            expect(existsSync(resolve(base, render)), `render 文件缺失：${render}`).toBe(true);
          };
          return;
        }
        // ② 官方插件（源码已外移，E6#99）：读随壳发货的种子 zip。⚠️ 包里 render **不是源码路径**——
        //    SDK build 会把它改写成已构建的入口（实测 settings：`views/SettingsView.bundle.js`）。
        //    所以这一支断言的是「声明的 render 在包内真实存在」（就是池打开视图时会 import 的那个路径）。
        const zip = await JSZip.loadAsync(readFileSync(resolve(PROJECT_ROOT, "bundled-plugins", `${pluginId}.linkdesk-plugin`)));
        const entries = new Set(Object.keys(zip.files));
        const pj = Object.keys(zip.files).find((n) => n === "plugin.json" || n.endsWith("/plugin.json"));
        if (!pj) throw new Error(`种子 ${pluginId}.linkdesk-plugin 里没有 plugin.json`);
        manifest = JSON.parse(await zip.file(pj)!.async("string")) as PluginManifest;
        assertRender = (render) => {
          expect(entries.has(render), `包内缺少 render 条目：${render}`).toBe(true);
        };
      });

      it("声明 floatingPanel.viewId 为非空字符串", () => {
        const { viewId } = declOf(manifest);
        expect(typeof viewId).toBe("string");
        expect((viewId as string).length).toBeGreaterThan(0);
      });

      it("viewId 引用 contributes.views 中已声明的视图 id（声明寻址前提）", () => {
        const { contributes, viewId } = declOf(manifest);
        const allViewIds = Object.values(contributes?.views ?? {}).flat().map((v) => v.id);
        expect(allViewIds).toContain(viewId);
      });

      it("该视图 render 物理存在（源码树 → 落在 src/views/**；已构建包 → 条目在包里）", () => {
        const { viewId, viewDef } = declOf(manifest);
        expect(viewDef?.render, `视图 "${String(viewId)}" 必须声明 render`).toBeTruthy();
        assertRender(normalizePath(viewDef?.render as string));
      });

      it("容器 location=auxiliarybar（LinkDesk 无此区域渲染——真不可见 + _viewIndex 可寻址）", () => {
        const { contributes, containerId } = declOf(manifest);
        expect(contributes?.viewsContainers?.[containerId]?.location).toBe("auxiliarybar");
      });

      it("端到端：真实 manifest 注册 → getFloatingPanelViewId 返回声明 viewId（子项 C 注入条件）", () => {
        const { viewId } = declOf(manifest);
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
