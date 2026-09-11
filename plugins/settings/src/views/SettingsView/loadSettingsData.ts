/**
 * 设置分组树的数据拉取与组装——E6#87d 自 SettingsView.tsx 的 loadData 回调逐字搬出（只搬家，零逻辑变更）。
 * 自壳迁入（E5.8#41.14 内置设置纯插件化）；核心无知原则：不知道有哪些设置项——全部从 ConfigurationRegistry 派生。
 */

import { lk, OWN_FACTORY_ROLE } from "./helpers";
import type { GroupInfo, ConfigProperty } from "./types";

/** 一次拉齐：配置分组 + 合并 schema + 角色枚举（#41.14 ⑤）+ 设置套候选/激活（#41.13） */
export async function loadSettingsData(t: (key: string) => string): Promise<{
  groups: GroupInfo[];
  allProps: Record<string, ConfigProperty>;
  candidates: { pluginId: string; title: string; viewId?: string }[];
  activeId: string | undefined;
}> {
  const cfg = lk();
  const fs = window.linkdesk.factorySlots;
  // 并行拉取：配置分组 + schema + 角色枚举（#41.14 ⑤ 角色分组）+ 设置套候选/激活（#41.13）
  const [entries, schema, roles, candidatesRaw, settingsActiveId] = await Promise.all([
    cfg.getConfigurationContributions(),
    cfg.getSchema(),
    fs.listRoles(),
    fs.list(OWN_FACTORY_ROLE),
    fs.getActive(OWN_FACTORY_ROLE),
  ]);
  // E5.8#41.14：getConfigurationContributions 契约已补全命名类型（LinkDeskConfigurationContribution）
  // ——不再需要 IPC 边界 cast，形状由契约保证
  const contributions = new Map(entries);
  const result: GroupInfo[] = [];

  // ① contributes.configuration 分组（非空）
  for (const [pluginId, contrib] of contributions) {
    const keys = Object.keys(contrib.properties ?? {});
    if (keys.length > 0) {
      result.push({ pluginId, title: t(contrib.title ?? pluginId), keys });
    }
  }

  // ② factoryRole 角色分组（#41.14 ⑤）——任何非本设置插件角色 ≥2 候选 → 该角色名组出现：
  //    切换按钮在顶、激活套配置在下；复用同名组优先（按 pluginId 找激活候选自己的配置组，非显示名）、
  //    没有才新建；激活套无配置项 → 空状态。自身角色切换 = 顶部通用区（#41.13），不进导航组。
  const roleRows = await Promise.all(
    roles
      .filter((role) => role !== OWN_FACTORY_ROLE)
      .map(async (role) => {
        const [candidates, activeId] = await Promise.all([fs.list(role), fs.getActive(role)]);
        return { role, candidates, activeId };
      })
  );
  for (const { role, candidates, activeId } of roleRows) {
    if (!candidates || candidates.length < 2) continue; // 单候选不建组（无切换意义）
    const active = candidates.find((c) => c.pluginId === activeId) ?? candidates[0];
    const existing = contributions.get(active.pluginId);
    if (existing) {
      // 复用同名组：切换条直接进激活候选自己的配置组，不新建
      const idx = result.findIndex((g) => g.pluginId === active.pluginId);
      if (idx >= 0) {
        result[idx] = { ...result[idx], role, candidates, activeId: active.pluginId };
      } else {
        // 激活候选有贡献但组空（被 ① 过滤）——仍按贡献标题建组，保持命名语义
        result.push({
          pluginId: active.pluginId,
          title: t(existing.title ?? active.title),
          keys: Object.keys(existing.properties ?? {}),
          role,
          candidates,
          activeId: active.pluginId,
        });
      }
    } else {
      // 没有才新建：候选不贡献配置 → 自动建组 + 激活套无配置项空状态
      result.push({
        pluginId: active.pluginId,
        title: t(active.title),
        keys: [],
        role,
        candidates,
        activeId: active.pluginId,
      });
    }
  }

  return {
    groups: result,
    allProps: (schema ?? {}) as Record<string, ConfigProperty>,
    candidates: candidatesRaw ?? [],
    activeId: settingsActiveId,
  };
}
