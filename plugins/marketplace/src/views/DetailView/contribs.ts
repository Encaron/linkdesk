/**
 * contribs——`contributes` 四组的解析（命令 / 配置项 / 键绑定 / 菜单项）。
 * E6#86a（第 3.6.3 轮）feature-folder 拆分：自 `views/DetailFeaturesTab.tsx` 原样搬出，零行为变更
 * （该文件同期迁入 `views/DetailView/FeaturesTab.tsx`）。
 *
 * 数据 = `list().manifest.contributes`（现成字段，壳零新 API）。contributes 只在已装**启用**分支存在
 * （list() 序列化子集含 contributes；禁用 getDisabled 子集与未装目录均无）→ 无数据由视图走空态引导措辞分档。
 * 逐 key 收窄：容忍缺省形状，个别坏项不崩整组。
 */

export type CmdItem = { id?: string; title?: string; command?: string };
export type KbItem = { key?: string; command?: string };
export type MenuItem = { command?: string };
export type ConfigItem = [string, { description?: string } | undefined];

function asList(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export function cmdIdOf(c: CmdItem): string {
  return (c.id ?? c.command ?? "").trim();
}

/** 四组解析——有声明才出现（每组 0 项不渲染组壳） */
export function parseContribs(contributes?: Record<string, unknown>): {
  commands: CmdItem[];
  configs: ConfigItem[];
  keybindings: KbItem[];
  menuRows: Array<{ menu: string; command: string }>;
} {
  const commands: CmdItem[] = asList(contributes?.commands)
    .map((c) => c as CmdItem)
    .filter((c) => cmdIdOf(c));
  const configObj = (contributes?.configuration ?? {}) as { properties?: Record<string, { description?: string }> };
  const configs: ConfigItem[] = configObj.properties ? Object.entries(configObj.properties) : [];
  const keybindings: KbItem[] = asList(contributes?.keybindings)
    .map((k) => k as KbItem)
    .filter((k) => k.command || k.key);
  const menusRaw = (contributes?.menus ?? {}) as Record<string, unknown>;
  const menuRows: Array<{ menu: string; command: string }> = [];
  for (const [menu, items] of Object.entries(menusRaw)) {
    const list = Array.isArray(items) ? items : [];
    for (const it of list as MenuItem[]) {
      if (it?.command) menuRows.push({ menu, command: it.command });
    }
  }
  return { commands, configs, keybindings, menuRows };
}
