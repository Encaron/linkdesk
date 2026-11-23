/**
 * display-text — **声明式显示文本的唯一清单与解析器**（纯函数，零依赖）。
 *
 * 为什么存在（2026-11-23 用户拍板）：
 *   插件市场只是渲染器，翻译不该由它接线。宿主必须先按插件 i18n 字典把 manifest 里
 *   **所有给人看的字符串**解析完，再把 resolved 视图交给任何 UI（官方市场、第三方市场、
 *   命令面板、菜单、设置页）。否则每换一个渲染器就要重写一遍 t()，漏一处就是中文混排。
 *
 * 三条铁律：
 *   ① 字段表只在这里定义一次——壳门禁、SDK lint/publish、宿主解析共用，⛔ 不许各写一份；
 *   ② 只收「显示文本」：name/description、commands、menus、views、configuration、statusBar、
 *      titleBar label、themes/languages label 等；id/command/path/when/icon 等机器字段一律排除；
 *   ③ 插件自己视图里的文案仍由插件调用 t()（那是插件代码）；本模块只管 manifest 声明面。
 *
 * 解析语义：key = 中文原文；字典缺键 → 返回原文（base 兜底，永不空白）。
 * 作者侧完整性由 `missingDisplayTranslations()` 判定：声明了哪些语言，就必须覆盖哪些语言。
 */

/** 路径段：对象键或数组下标。 */
export type DisplayTextPath = Array<string | number>;

export interface DisplayTextEntry {
  /** 稳定路径，例如 `contributes.commands[3].description` */
  path: DisplayTextPath;
  /** 人读路径（错误信息用） */
  label: string;
  /** 中文原文（= i18n key） */
  text: string;
}

export interface MissingDisplayTranslation {
  path: DisplayTextPath;
  label: string;
  text: string;
  lang: string;
}

export type ResolveDisplayText = (text: string, entry: DisplayTextEntry) => string;

/** 字典形状：语言码 → { 中文原文: 译文 }。 */
export type DisplayDicts = Record<string, Record<string, unknown> | undefined>;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isDisplayString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0 && !v.trim().startsWith("$");

const pathLabel = (path: DisplayTextPath): string =>
  path.reduce<string>((acc, seg) => {
    if (typeof seg === "number") return `${acc}[${seg}]`;
    return acc ? `${acc}.${seg}` : seg;
  }, "");

/** 收集声明面上的全部显示文本（顺序稳定：声明顺序）。 */
export function collectManifestDisplayText(manifest: unknown): DisplayTextEntry[] {
  const out: DisplayTextEntry[] = [];
  const add = (path: DisplayTextPath, value: unknown) => {
    if (!isDisplayString(value)) return;
    out.push({ path, label: pathLabel(path), text: value });
  };

  if (!isObject(manifest)) return out;
  add(["name"], manifest.name);
  add(["description"], manifest.description);

  // 顶层 legacy 字段（老主题/语言包）
  if (Array.isArray(manifest.themes)) {
    manifest.themes.forEach((t, i) => {
      if (isObject(t)) add(["themes", i, "name"], t.name);
    });
  }
  if (Array.isArray(manifest.languages)) {
    manifest.languages.forEach((l, i) => {
      if (isObject(l)) add(["languages", i, "name"], l.name);
    });
  }
  if (Array.isArray(manifest.statusBar)) {
    manifest.statusBar.forEach((s, i) => {
      if (isObject(s)) add(["statusBar", i, "label"], s.label);
    });
  }

  const c = manifest.contributes;
  if (!isObject(c)) return out;

  // commands
  if (Array.isArray(c.commands)) {
    c.commands.forEach((cmd, i) => {
      if (!isObject(cmd)) return;
      add(["contributes", "commands", i, "title"], cmd.title);
      add(["contributes", "commands", i, "category"], cmd.category);
      add(["contributes", "commands", i, "description"], cmd.description);
      if (Array.isArray(cmd.params)) {
        cmd.params.forEach((p, j) => {
          if (isObject(p)) add(["contributes", "commands", i, "params", j, "description"], p.description);
        });
      }
    });
  }

  // menus（object: menuId → (string | item)[]；children 任意深度）
  if (isObject(c.menus)) {
    for (const [menuId, items] of Object.entries(c.menus)) {
      if (!Array.isArray(items)) continue;
      const walkMenu = (list: unknown[], base: DisplayTextPath) => {
        list.forEach((it, i) => {
          if (!isObject(it)) return;
          add([...base, i, "label"], it.label);
          if (Array.isArray(it.children)) walkMenu(it.children, [...base, i, "children"]);
        });
      };
      walkMenu(items, ["contributes", "menus", menuId]);
    }
  }

  // viewsContainers / views
  if (isObject(c.viewsContainers)) {
    for (const [id, vc] of Object.entries(c.viewsContainers)) {
      if (isObject(vc)) add(["contributes", "viewsContainers", id, "title"], vc.title);
    }
  }
  if (isObject(c.views)) {
    for (const [containerId, views] of Object.entries(c.views)) {
      if (!Array.isArray(views)) continue;
      views.forEach((v, i) => {
        if (!isObject(v)) return;
        add(["contributes", "views", containerId, i, "title"], v.title);
        add(["contributes", "views", containerId, i, "titleDescription"], v.titleDescription);
        add(["contributes", "views", containerId, i, "titleTooltip"], v.titleTooltip);
        add(["contributes", "views", containerId, i, "singleViewPaneContainerTitle"], v.singleViewPaneContainerTitle);
        if (Array.isArray(v.titleActions)) {
          v.titleActions.forEach((a, j) => {
            if (!isObject(a)) return;
            add(["contributes", "views", containerId, i, "titleActions", j, "title"], a.title);
            if (Array.isArray(a.items)) {
              a.items.forEach((it, k) => {
                if (isObject(it)) add(["contributes", "views", containerId, i, "titleActions", j, "items", k, "label"], it.label);
              });
            }
          });
        }
      });
    }
  }

  // configuration
  if (isObject(c.configuration)) {
    add(["contributes", "configuration", "title"], c.configuration.title);
    add(["contributes", "configuration", "subtitle"], c.configuration.subtitle);
    if (isObject(c.configuration.groupDescriptions)) {
      for (const [key, value] of Object.entries(c.configuration.groupDescriptions)) {
        add(["contributes", "configuration", "groupDescriptions", key], value);
      }
    }
    if (isObject(c.configuration.properties)) {
      for (const [key, prop] of Object.entries(c.configuration.properties)) {
        if (!isObject(prop)) continue;
        add(["contributes", "configuration", "properties", key, "title"], prop.title);
        add(["contributes", "configuration", "properties", key, "description"], prop.description);
        add(["contributes", "configuration", "properties", key, "group"], prop.group);
        if (isObject(prop.enumDescriptions)) {
          for (const [enumKey, value] of Object.entries(prop.enumDescriptions)) {
            add(["contributes", "configuration", "properties", key, "enumDescriptions", enumKey], value);
          }
        }
      }
    }
  }

  // themes / iconThemes / languages / icons / fileAssociations / titleBar
  if (Array.isArray(c.themes)) {
    c.themes.forEach((t, i) => {
      if (isObject(t)) add(["contributes", "themes", i, "label"], t.label);
    });
  }
  if (Array.isArray(c.iconThemes)) {
    c.iconThemes.forEach((t, i) => {
      if (isObject(t)) add(["contributes", "iconThemes", i, "label"], t.label);
    });
  }
  if (Array.isArray(c.languages)) {
    c.languages.forEach((l, i) => {
      if (isObject(l)) add(["contributes", "languages", i, "label"], l.label);
    });
  }
  if (isObject(c.icons)) {
    for (const [key, icon] of Object.entries(c.icons)) {
      if (isObject(icon)) add(["contributes", "icons", key, "description"], icon.description);
    }
  }
  if (Array.isArray(c.fileAssociations)) {
    c.fileAssociations.forEach((fa, i) => {
      if (isObject(fa)) add(["contributes", "fileAssociations", i, "displayName"], fa.displayName);
    });
  }
  if (isObject(c.titleBar)) {
    for (const slot of ["left", "right"] as const) {
      const list = c.titleBar[slot];
      if (!Array.isArray(list)) continue;
      list.forEach((btn, i) => {
        if (isObject(btn)) add(["contributes", "titleBar", slot, i, "label"], btn.label);
      });
    }
  }

  return out;
}

/** 字典值 → 译文；缺键/空值 → 原文（base 兜底）。 */
export function dictDisplayText(dict: Record<string, unknown> | undefined, text: string): string {
  if (!dict) return text;
  const value = dict[text];
  return typeof value === "string" && value.trim() ? value : text;
}

/** 缺失译文：声明了哪些语言，就必须覆盖哪些语言（key 精确等于原文）。 */
export function missingDisplayTranslations(
  manifest: unknown,
  dicts: DisplayDicts,
): MissingDisplayTranslation[] {
  const out: MissingDisplayTranslation[] = [];
  const langs = Object.keys(dicts);
  if (!langs.length) return out;
  for (const entry of collectManifestDisplayText(manifest)) {
    for (const lang of langs) {
      const dict = dicts[lang];
      const value = dict?.[entry.text];
      if (typeof value === "string" && value.trim()) continue;
      out.push({ path: entry.path, label: entry.label, text: entry.text, lang });
    }
  }
  return out;
}

function setAt(root: unknown, path: DisplayTextPath, value: string): void {
  let cur = root as Record<string, unknown> | unknown[];
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i];
    if (cur == null || typeof cur !== "object") return;
    cur = (cur as Record<string | number, unknown>)[seg] as Record<string, unknown> | unknown[];
  }
  if (cur == null || typeof cur !== "object") return;
  const last = path[path.length - 1];
  (cur as Record<string | number, unknown>)[last] = value;
}

/** 解析整份 manifest：只替换显示字段，id/command/path 等原样保留。 */
export function resolveDisplayManifest<T>(manifest: T, resolve: ResolveDisplayText): T {
  const clone = JSON.parse(JSON.stringify(manifest)) as T;
  for (const entry of collectManifestDisplayText(manifest)) {
    const value = resolve(entry.text, entry);
    if (typeof value === "string" && value !== entry.text) setAt(clone, entry.path, value);
  }
  return clone;
}
