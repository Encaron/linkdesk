/**
 * 🔥 runtime-shapes.ts——运行期契约形状断言（自动生成，勿手改）
 *
 * 生成源：electron/ipc/runtime-dto-registry.ts（通道→DTO 注册表）
 *         + src/core/types/ipc|pool（DTO 类型）+ electron/ipc/channels.ts（通道名）
 * 生成器：scripts/generate-contract.mjs（E5.8#22.5 第二产物）
 * 改契约源/注册表 → 跑 `node scripts/generate-contract.mjs`（npm run check 里 check-contracts 双产物强制）
 *
 * 用途：preload 接收边界对推流载荷做形状断言——"哪条通道拿到异形数据"可查可诊断。
 * 语义：never-throw + log-only（guard 只返回错误串，不抛异常；调用方 wire-guard.ts 决定上报方式）。
 *       未注册通道 validateWire 返回 null。
 */

// ── 类型校验函数（命名类型 helper，递归去环；v=待检值 / p=字段路径 / errs=错误收集）──
function chkConfigurationChangedPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t0 = v as Record<string, unknown>;
    if (typeof _t0.key !== "string") errs.push(((p) + ".key") + ": 期望 string，实收 " + typeof _t0.key);
  }
}
function chkThemeChangedPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t1 = v as Record<string, unknown>;
    if (typeof _t1.themeType !== "string") errs.push(((p) + ".themeType") + ": 期望 string，实收 " + typeof _t1.themeType);
    if (_t1.variables === null || typeof _t1.variables !== "object" || Array.isArray(_t1.variables)) errs.push(((p) + ".variables") + ": 期望 object");
    else {
      const _t2 = _t1.variables as Record<string, unknown>;
      for (const _t3 of Object.keys(_t2)) {
      if (typeof _t2[_t3] !== "string") errs.push((((p) + ".variables") + "[\"" + _t3 + "\"]") + ": 期望 string，实收 " + typeof _t2[_t3]);
      }
    }
  }
}
function chkAccentChangedPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t4 = v as Record<string, unknown>;
    if (_t4.variables === null || typeof _t4.variables !== "object" || Array.isArray(_t4.variables)) errs.push(((p) + ".variables") + ": 期望 object");
    else {
      const _t5 = _t4.variables as Record<string, unknown>;
      for (const _t6 of Object.keys(_t5)) {
      if (typeof _t5[_t6] !== "string") errs.push((((p) + ".variables") + "[\"" + _t6 + "\"]") + ": 期望 string，实收 " + typeof _t5[_t6]);
      }
    }
  }
}
function chkPluginStateChangedPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t7 = v as Record<string, unknown>;
    if (typeof _t7.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t7.pluginId);
    if (typeof _t7.key !== "string") errs.push(((p) + ".key") + ": 期望 string，实收 " + typeof _t7.key);
  }
}
function chkTabActivatedPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t8 = v as Record<string, unknown>;
    if (typeof _t8.tabId !== "string") errs.push(((p) + ".tabId") + ": 期望 string，实收 " + typeof _t8.tabId);
    if (typeof _t8.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t8.pluginId);
    if (_t8.filePath !== undefined) {
    if (typeof _t8.filePath !== "string") errs.push(((p) + ".filePath") + ": 期望 string，实收 " + typeof _t8.filePath);
    }
  }
}
function chkWorkspaceActiveChangedPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t9 = v as Record<string, unknown>;
    if (typeof _t9.uri !== "string") errs.push(((p) + ".uri") + ": 期望 string，实收 " + typeof _t9.uri);
  }
}
function chkSettingsRequestGroupPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t10 = v as Record<string, unknown>;
    if (typeof _t10.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t10.pluginId);
  }
}
function chkSettingsScrollToPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t11 = v as Record<string, unknown>;
    if (typeof _t11.key !== "string") errs.push(((p) + ".key") + ": 期望 string，实收 " + typeof _t11.key);
  }
}
function chkSerialDataPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t12 = v as Record<string, unknown>;
    if (typeof _t12.portName !== "string") errs.push(((p) + ".portName") + ": 期望 string，实收 " + typeof _t12.portName);
    if (typeof _t12.text !== "string") errs.push(((p) + ".text") + ": 期望 string，实收 " + typeof _t12.text);
  }
}
function chkSerialStatsPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t13 = v as Record<string, unknown>;
    if (typeof _t13.portName !== "string") errs.push(((p) + ".portName") + ": 期望 string，实收 " + typeof _t13.portName);
    if (_t13.tx !== undefined) {
    if (typeof _t13.tx !== "number") errs.push(((p) + ".tx") + ": 期望 number，实收 " + typeof _t13.tx);
    }
    if (_t13.rx !== undefined) {
    if (typeof _t13.rx !== "number") errs.push(((p) + ".rx") + ": 期望 number，实收 " + typeof _t13.rx);
    }
  }
}
function chkSerialSystemPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t14 = v as Record<string, unknown>;
    if (typeof _t14.portName !== "string") errs.push(((p) + ".portName") + ": 期望 string，实收 " + typeof _t14.portName);
    if (typeof _t14.message !== "string") errs.push(((p) + ".message") + ": 期望 string，实收 " + typeof _t14.message);
    if (!(_t14.type === "status" || _t14.type === "error")) errs.push(((p) + ".type") + ": 期望 status|error");
  }
}
function chkPoolMenuItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t20 = v as Record<string, unknown>;
    if (typeof _t20.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t20.label);
    if (typeof _t20.command !== "string") errs.push(((p) + ".command") + ": 期望 string，实收 " + typeof _t20.command);
    if (_t20.shortcut !== undefined) {
    if (typeof _t20.shortcut !== "string") errs.push(((p) + ".shortcut") + ": 期望 string，实收 " + typeof _t20.shortcut);
    }
    if (_t20.disabled !== undefined) {
    if (!(_t20.disabled === false || _t20.disabled === true)) errs.push(((p) + ".disabled") + ": 期望 false|true");
    }
    if (_t20.children !== undefined) {
    if (!Array.isArray(_t20.children)) errs.push(((p) + ".children") + ": 期望数组");
    else {
      for (let _t21 = 0; _t21 < _t20.children.length; _t21++) {
          chkPoolMenuItem(_t20.children[_t21], (((p) + ".children") + "[" + _t21 + "]"), errs);
      }
    }
    }
  }
}
function chkPoolMenuGroup(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t18 = v as Record<string, unknown>;
    if (typeof _t18.group !== "string") errs.push(((p) + ".group") + ": 期望 string，实收 " + typeof _t18.group);
    if (typeof _t18.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t18.label);
    if (!Array.isArray(_t18.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t19 = 0; _t19 < _t18.items.length; _t19++) {
          chkPoolMenuItem(_t18.items[_t19], (((p) + ".items") + "[" + _t19 + "]"), errs);
      }
    }
  }
}
function chkTitleBarSlotButton(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t24 = v as Record<string, unknown>;
    if (typeof _t24.command !== "string") errs.push(((p) + ".command") + ": 期望 string，实收 " + typeof _t24.command);
    if (_t24.icon !== undefined) {
    if (typeof _t24.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t24.icon);
    }
    if (typeof _t24.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t24.title);
  }
}
function chkTitleBarLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t16 = v as Record<string, unknown>;
    if (typeof _t16.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t16.title);
    if (typeof _t16.logoUrl !== "string") errs.push(((p) + ".logoUrl") + ": 期望 string，实收 " + typeof _t16.logoUrl);
    if (!(_t16.menuBarVisible === false || _t16.menuBarVisible === true)) errs.push(((p) + ".menuBarVisible") + ": 期望 false|true");
    if (!Array.isArray(_t16.menuGroups)) errs.push(((p) + ".menuGroups") + ": 期望数组");
    else {
      for (let _t17 = 0; _t17 < _t16.menuGroups.length; _t17++) {
          chkPoolMenuGroup(_t16.menuGroups[_t17], (((p) + ".menuGroups") + "[" + _t17 + "]"), errs);
      }
    }
    if (_t16.slots === null || typeof _t16.slots !== "object" || Array.isArray(_t16.slots)) errs.push(((p) + ".slots") + ": 期望 object");
    else {
      const _t22 = _t16.slots as Record<string, unknown>;
      if (!Array.isArray(_t22.left)) errs.push((((p) + ".slots") + ".left") + ": 期望数组");
      else {
        for (let _t23 = 0; _t23 < _t22.left.length; _t23++) {
            chkTitleBarSlotButton(_t22.left[_t23], ((((p) + ".slots") + ".left") + "[" + _t23 + "]"), errs);
        }
      }
      if (!Array.isArray(_t22.right)) errs.push((((p) + ".slots") + ".right") + ": 期望数组");
      else {
        for (let _t25 = 0; _t25 < _t22.right.length; _t25++) {
            chkTitleBarSlotButton(_t22.right[_t25], ((((p) + ".slots") + ".right") + "[" + _t25 + "]"), errs);
        }
      }
    }
    if (_t16.windowControls === null || typeof _t16.windowControls !== "object" || Array.isArray(_t16.windowControls)) errs.push(((p) + ".windowControls") + ": 期望 object");
    else {
      const _t26 = _t16.windowControls as Record<string, unknown>;
      if (typeof _t26.minimize !== "string") errs.push((((p) + ".windowControls") + ".minimize") + ": 期望 string，实收 " + typeof _t26.minimize);
      if (typeof _t26.maximize !== "string") errs.push((((p) + ".windowControls") + ".maximize") + ": 期望 string，实收 " + typeof _t26.maximize);
      if (typeof _t26.restore !== "string") errs.push((((p) + ".windowControls") + ".restore") + ": 期望 string，实收 " + typeof _t26.restore);
      if (typeof _t26.close !== "string") errs.push((((p) + ".windowControls") + ".close") + ": 期望 string，实收 " + typeof _t26.close);
    }
  }
}
function chkIconBarIcon(v: unknown, p: string, errs: string[]): void {
  const _t30: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t30.push((p) + ": 期望 object");
    else {
      const _t31 = v as Record<string, unknown>;
      if (_t31.kind !== "lucide") _t30.push(((p) + ".kind") + ": 期望 lucide");
      if (typeof _t31.name !== "string") _t30.push(((p) + ".name") + ": 期望 string，实收 " + typeof _t31.name);
    }
  const _t32 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).kind === "lucide" ? 1 : 0)) : 0);
  if (_t30.length > 0) {
  const _t33: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t33.push((p) + ": 期望 object");
    else {
      const _t34 = v as Record<string, unknown>;
      if (_t34.kind !== "codicon") _t33.push(((p) + ".kind") + ": 期望 codicon");
      if (typeof _t34.name !== "string") _t33.push(((p) + ".name") + ": 期望 string，实收 " + typeof _t34.name);
    }
  const _t35 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).kind === "codicon" ? 1 : 0)) : 0);
  if (_t33.length > 0) {
  const _t36: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t36.push((p) + ": 期望 object");
    else {
      const _t37 = v as Record<string, unknown>;
      if (_t37.kind !== "img") _t36.push(((p) + ".kind") + ": 期望 img");
      if (typeof _t37.src !== "string") _t36.push(((p) + ".src") + ": 期望 string，实收 " + typeof _t37.src);
    }
  const _t38 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).kind === "img" ? 1 : 0)) : 0);
  if (_t36.length > 0) {
  const _t39: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t39.push((p) + ": 期望 object");
    else {
      const _t40 = v as Record<string, unknown>;
      if (_t40.kind !== "emoji") _t39.push(((p) + ".kind") + ": 期望 emoji");
      if (typeof _t40.text !== "string") _t39.push(((p) + ".text") + ": 期望 string，实收 " + typeof _t40.text);
    }
  const _t41 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).kind === "emoji" ? 1 : 0)) : 0);
  const _t42 = [{ e: _t30, s: _t32 }, { e: _t33, s: _t35 }, { e: _t36, s: _t38 }, { e: _t39, s: _t41 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t42.length > 0) errs.push(..._t42);
  }
  }
  }
}
function chkIconBarItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t29 = v as Record<string, unknown>;
    if (typeof _t29.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t29.pluginId);
    chkIconBarIcon(_t29.icon, ((p) + ".icon"), errs);
    if (typeof _t29.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t29.label);
    if (!(_t29.location === "top" || _t29.location === "bottom")) errs.push(((p) + ".location") + ": 期望 top|bottom");
  }
}
function chkIconBarLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t27 = v as Record<string, unknown>;
    if (!Array.isArray(_t27.icons)) errs.push(((p) + ".icons") + ": 期望数组");
    else {
      for (let _t28 = 0; _t28 < _t27.icons.length; _t28++) {
          chkIconBarItem(_t27.icons[_t28], (((p) + ".icons") + "[" + _t28 + "]"), errs);
      }
    }
    if (_t27.activePluginId !== undefined) {
    if (typeof _t27.activePluginId !== "string") errs.push(((p) + ".activePluginId") + ": 期望 string，实收 " + typeof _t27.activePluginId);
    }
    if (!(_t27.hamburgerVisible === false || _t27.hamburgerVisible === true)) errs.push(((p) + ".hamburgerVisible") + ": 期望 false|true");
    if (typeof _t27.navLabel !== "string") errs.push(((p) + ".navLabel") + ": 期望 string，实收 " + typeof _t27.navLabel);
    if (_t27.hamburger !== undefined) {
    if (_t27.hamburger === null || typeof _t27.hamburger !== "object" || Array.isArray(_t27.hamburger)) errs.push(((p) + ".hamburger") + ": 期望 object");
    else {
      const _t43 = _t27.hamburger as Record<string, unknown>;
      if (typeof _t43.title !== "string") errs.push((((p) + ".hamburger") + ".title") + ": 期望 string，实收 " + typeof _t43.title);
      if (!Array.isArray(_t43.groups)) errs.push((((p) + ".hamburger") + ".groups") + ": 期望数组");
      else {
        for (let _t44 = 0; _t44 < _t43.groups.length; _t44++) {
            chkPoolMenuGroup(_t43.groups[_t44], ((((p) + ".hamburger") + ".groups") + "[" + _t44 + "]"), errs);
        }
      }
    }
    }
  }
}
function chkSidebarViewMeta(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t47 = v as Record<string, unknown>;
    if (typeof _t47.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t47.id);
    if (typeof _t47.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t47.title);
    if (typeof _t47.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t47.pluginId);
    if (typeof _t47.renderPath !== "string") errs.push(((p) + ".renderPath") + ": 期望 string，实收 " + typeof _t47.renderPath);
    if (_t47.role !== undefined) {
    if (!(_t47.role === "toolbar" || _t47.role === "section")) errs.push(((p) + ".role") + ": 期望 toolbar|section");
    }
    if (_t47.order !== undefined) {
    if (typeof _t47.order !== "number") errs.push(((p) + ".order") + ": 期望 number，实收 " + typeof _t47.order);
    }
    if (_t47.collapsed !== undefined) {
    if (!(_t47.collapsed === false || _t47.collapsed === true)) errs.push(((p) + ".collapsed") + ": 期望 false|true");
    }
    if (_t47.badge !== undefined) {
    if (!(typeof _t47.badge === "string" || typeof _t47.badge === "number")) errs.push(((p) + ".badge") + ": 期望 string|number");
    }
    if (_t47.titleDescription !== undefined) {
    if (typeof _t47.titleDescription !== "string") errs.push(((p) + ".titleDescription") + ": 期望 string，实收 " + typeof _t47.titleDescription);
    }
    if (_t47.titleTooltip !== undefined) {
    if (typeof _t47.titleTooltip !== "string") errs.push(((p) + ".titleTooltip") + ": 期望 string，实收 " + typeof _t47.titleTooltip);
    }
    if (_t47.singleViewPaneContainerTitle !== undefined) {
    if (typeof _t47.singleViewPaneContainerTitle !== "string") errs.push(((p) + ".singleViewPaneContainerTitle") + ": 期望 string，实收 " + typeof _t47.singleViewPaneContainerTitle);
    }
    if (_t47.minHeight !== undefined) {
    if (typeof _t47.minHeight !== "number") errs.push(((p) + ".minHeight") + ": 期望 number，实收 " + typeof _t47.minHeight);
    }
  }
}
function chkSidebarContainerLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t49 = v as Record<string, unknown>;
    if (typeof _t49.containerId !== "string") errs.push(((p) + ".containerId") + ": 期望 string，实收 " + typeof _t49.containerId);
    if (typeof _t49.containerTitle !== "string") errs.push(((p) + ".containerTitle") + ": 期望 string，实收 " + typeof _t49.containerTitle);
    if (_t49.mergeHeaderWhenSingle !== undefined) {
    if (!(_t49.mergeHeaderWhenSingle === false || _t49.mergeHeaderWhenSingle === true)) errs.push(((p) + ".mergeHeaderWhenSingle") + ": 期望 false|true");
    }
    if (!Array.isArray(_t49.views)) errs.push(((p) + ".views") + ": 期望数组");
    else {
      for (let _t50 = 0; _t50 < _t49.views.length; _t50++) {
          chkSidebarViewMeta(_t49.views[_t50], (((p) + ".views") + "[" + _t50 + "]"), errs);
      }
    }
  }
}
function chkSidebarLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t45 = v as Record<string, unknown>;
    if (!(_t45.visible === false || _t45.visible === true)) errs.push(((p) + ".visible") + ": 期望 false|true");
    if (typeof _t45.width !== "number") errs.push(((p) + ".width") + ": 期望 number，实收 " + typeof _t45.width);
    if (!(_t45.containerId === null || typeof _t45.containerId === "string")) errs.push(((p) + ".containerId") + ": 期望 null|string");
    if (typeof _t45.containerTitle !== "string") errs.push(((p) + ".containerTitle") + ": 期望 string，实收 " + typeof _t45.containerTitle);
    if (_t45.mergeHeaderWhenSingle !== undefined) {
    if (!(_t45.mergeHeaderWhenSingle === false || _t45.mergeHeaderWhenSingle === true)) errs.push(((p) + ".mergeHeaderWhenSingle") + ": 期望 false|true");
    }
    if (!Array.isArray(_t45.views)) errs.push(((p) + ".views") + ": 期望数组");
    else {
      for (let _t46 = 0; _t46 < _t45.views.length; _t46++) {
          chkSidebarViewMeta(_t45.views[_t46], (((p) + ".views") + "[" + _t46 + "]"), errs);
      }
    }
    if (_t45.containers !== undefined) {
    if (!Array.isArray(_t45.containers)) errs.push(((p) + ".containers") + ": 期望数组");
    else {
      for (let _t48 = 0; _t48 < _t45.containers.length; _t48++) {
          chkSidebarContainerLayout(_t45.containers[_t48], (((p) + ".containers") + "[" + _t48 + "]"), errs);
      }
    }
    }
    if (_t45.collapsedViews !== undefined) {
    if (!Array.isArray(_t45.collapsedViews)) errs.push(((p) + ".collapsedViews") + ": 期望数组");
    else {
      for (let _t51 = 0; _t51 < _t45.collapsedViews.length; _t51++) {
          if (typeof _t45.collapsedViews[_t51] !== "string") errs.push((((p) + ".collapsedViews") + "[" + _t51 + "]") + ": 期望 string，实收 " + typeof _t45.collapsedViews[_t51]);
      }
    }
    }
    if (_t45.collapsed !== undefined) {
    if (!(_t45.collapsed === false || _t45.collapsed === true)) errs.push(((p) + ".collapsed") + ": 期望 false|true");
    }
    if (_t45.emptyText !== undefined) {
    if (typeof _t45.emptyText !== "string") errs.push(((p) + ".emptyText") + ": 期望 string，实收 " + typeof _t45.emptyText);
    }
    if (_t45.emptyHint !== undefined) {
    if (typeof _t45.emptyHint !== "string") errs.push(((p) + ".emptyHint") + ": 期望 string，实收 " + typeof _t45.emptyHint);
    }
    if (_t45.expandTooltip !== undefined) {
    if (typeof _t45.expandTooltip !== "string") errs.push(((p) + ".expandTooltip") + ": 期望 string，实收 " + typeof _t45.expandTooltip);
    }
    if (_t45.collapseTooltip !== undefined) {
    if (typeof _t45.collapseTooltip !== "string") errs.push(((p) + ".collapseTooltip") + ": 期望 string，实收 " + typeof _t45.collapseTooltip);
    }
    if (_t45.minWidth !== undefined) {
    if (typeof _t45.minWidth !== "number") errs.push(((p) + ".minWidth") + ": 期望 number，实收 " + typeof _t45.minWidth);
    }
    if (_t45.maxWidth !== undefined) {
    if (typeof _t45.maxWidth !== "number") errs.push(((p) + ".maxWidth") + ": 期望 number，实收 " + typeof _t45.maxWidth);
    }
    if (_t45.viewId !== undefined) {
    if (!(_t45.viewId === null || typeof _t45.viewId === "string")) errs.push(((p) + ".viewId") + ": 期望 null|string");
    }
  }
}
function chkPoolTab(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t55 = v as Record<string, unknown>;
    if (typeof _t55.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t55.id);
    if (typeof _t55.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t55.pluginId);
    if (typeof _t55.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t55.title);
    if (_t55.sourceId !== undefined) {
    if (typeof _t55.sourceId !== "string") errs.push(((p) + ".sourceId") + ": 期望 string，实收 " + typeof _t55.sourceId);
    }
    if (_t55.dirty !== undefined) {
    if (!(_t55.dirty === false || _t55.dirty === true)) errs.push(((p) + ".dirty") + ": 期望 false|true");
    }
    if (_t55.icon !== undefined) {
    if (typeof _t55.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t55.icon);
    }
    if (_t55.pinned !== undefined) {
    if (!(_t55.pinned === false || _t55.pinned === true)) errs.push(((p) + ".pinned") + ": 期望 false|true");
    }
    if (_t55.closeBehavior !== undefined) {
    if (!(_t55.closeBehavior === "normal" || _t55.closeBehavior === "confirm" || _t55.closeBehavior === "blocked")) errs.push(((p) + ".closeBehavior") + ": 期望 normal|confirm|blocked");
    }
    if (_t55.singleton !== undefined) {
    if (!(_t55.singleton === false || _t55.singleton === true)) errs.push(((p) + ".singleton") + ": 期望 false|true");
    }
    if (_t55.shellRendered !== undefined) {
    if (!(_t55.shellRendered === false || _t55.shellRendered === true)) errs.push(((p) + ".shellRendered") + ": 期望 false|true");
    }
    if (_t55.shellType !== undefined) {
    if (typeof _t55.shellType !== "string") errs.push(((p) + ".shellType") + ": 期望 string，实收 " + typeof _t55.shellType);
    }
    if (_t55.detailPluginId !== undefined) {
    if (typeof _t55.detailPluginId !== "string") errs.push(((p) + ".detailPluginId") + ": 期望 string，实收 " + typeof _t55.detailPluginId);
    }
  }
}
function chkPoolGroup(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t53 = v as Record<string, unknown>;
    if (typeof _t53.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t53.id);
    if (typeof _t53.flex !== "number") errs.push(((p) + ".flex") + ": 期望 number，实收 " + typeof _t53.flex);
    if (typeof _t53.activeTabId !== "string") errs.push(((p) + ".activeTabId") + ": 期望 string，实收 " + typeof _t53.activeTabId);
    if (!Array.isArray(_t53.tabs)) errs.push(((p) + ".tabs") + ": 期望数组");
    else {
      for (let _t54 = 0; _t54 < _t53.tabs.length; _t54++) {
          chkPoolTab(_t53.tabs[_t54], (((p) + ".tabs") + "[" + _t54 + "]"), errs);
      }
    }
  }
}
function chkSplitNode(v: unknown, p: string, errs: string[]): void {
  const _t56: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t56.push((p) + ": 期望 object");
    else {
      const _t57 = v as Record<string, unknown>;
      if (_t57.type !== "leaf") _t56.push(((p) + ".type") + ": 期望 leaf");
      if (typeof _t57.groupId !== "string") _t56.push(((p) + ".groupId") + ": 期望 string，实收 " + typeof _t57.groupId);
    }
  const _t58 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "leaf" ? 1 : 0)) : 0);
  if (_t56.length > 0) {
  const _t59: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t59.push((p) + ": 期望 object");
    else {
      const _t60 = v as Record<string, unknown>;
      if (_t60.type !== "branch") _t59.push(((p) + ".type") + ": 期望 branch");
      if (!(_t60.direction === "horizontal" || _t60.direction === "vertical")) _t59.push(((p) + ".direction") + ": 期望 horizontal|vertical");
      if (!Array.isArray(_t60.children)) _t59.push(((p) + ".children") + ": 期望数组");
      else {
        if (_t60.children.length !== 2) _t59.push(((p) + ".children") + ": 期望长度 2");
          chkSplitNode(_t60.children[0], (((p) + ".children") + "[0]"), _t59);
          chkSplitNode(_t60.children[1], (((p) + ".children") + "[1]"), _t59);
      }
      if (!Array.isArray(_t60.sizes)) _t59.push(((p) + ".sizes") + ": 期望数组");
      else {
        if (_t60.sizes.length !== 2) _t59.push(((p) + ".sizes") + ": 期望长度 2");
          if (typeof _t60.sizes[0] !== "number") _t59.push((((p) + ".sizes") + "[0]") + ": 期望 number，实收 " + typeof _t60.sizes[0]);
          if (typeof _t60.sizes[1] !== "number") _t59.push((((p) + ".sizes") + "[1]") + ": 期望 number，实收 " + typeof _t60.sizes[1]);
      }
    }
  const _t61 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "branch" ? 1 : 0) + (((v as Record<string, unknown>).direction === "horizontal") || ((v as Record<string, unknown>).direction === "vertical") ? 1 : 0)) : 0);
  const _t62 = [{ e: _t56, s: _t58 }, { e: _t59, s: _t61 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t62.length > 0) errs.push(..._t62);
  }
}
function chkCreatableViewMeta(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t64 = v as Record<string, unknown>;
    if (typeof _t64.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t64.pluginId);
    if (typeof _t64.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t64.label);
  }
}
function chkPanelViewMeta(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t67 = v as Record<string, unknown>;
    if (typeof _t67.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t67.id);
    if (typeof _t67.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t67.title);
    if (typeof _t67.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t67.pluginId);
    if (typeof _t67.renderPath !== "string") errs.push(((p) + ".renderPath") + ": 期望 string，实收 " + typeof _t67.renderPath);
  }
}
function chkPanelSwitcherItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t71 = v as Record<string, unknown>;
    if (typeof _t71.viewId !== "string") errs.push(((p) + ".viewId") + ": 期望 string，实收 " + typeof _t71.viewId);
    if (typeof _t71.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t71.title);
    if (typeof _t71.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t71.pluginId);
    if (!(_t71.visible === false || _t71.visible === true)) errs.push(((p) + ".visible") + ": 期望 false|true");
    if (!(_t71.active === false || _t71.active === true)) errs.push(((p) + ".active") + ": 期望 false|true");
  }
}
function chkPanelSwitcherGroup(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t69 = v as Record<string, unknown>;
    if (typeof _t69.containerId !== "string") errs.push(((p) + ".containerId") + ": 期望 string，实收 " + typeof _t69.containerId);
    if (typeof _t69.containerTitle !== "string") errs.push(((p) + ".containerTitle") + ": 期望 string，实收 " + typeof _t69.containerTitle);
    if (!Array.isArray(_t69.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t70 = 0; _t70 < _t69.items.length; _t70++) {
          chkPanelSwitcherItem(_t69.items[_t70], (((p) + ".items") + "[" + _t70 + "]"), errs);
      }
    }
  }
}
function chkPanelLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t65 = v as Record<string, unknown>;
    if (!(_t65.visible === false || _t65.visible === true)) errs.push(((p) + ".visible") + ": 期望 false|true");
    if (typeof _t65.height !== "number") errs.push(((p) + ".height") + ": 期望 number，实收 " + typeof _t65.height);
    if (typeof _t65.activeViewId !== "string") errs.push(((p) + ".activeViewId") + ": 期望 string，实收 " + typeof _t65.activeViewId);
    if (!Array.isArray(_t65.views)) errs.push(((p) + ".views") + ": 期望数组");
    else {
      for (let _t66 = 0; _t66 < _t65.views.length; _t66++) {
          chkPanelViewMeta(_t65.views[_t66], (((p) + ".views") + "[" + _t66 + "]"), errs);
      }
    }
    if (_t65.minHeight !== undefined) {
    if (typeof _t65.minHeight !== "number") errs.push(((p) + ".minHeight") + ": 期望 number，实收 " + typeof _t65.minHeight);
    }
    if (_t65.maxHeight !== undefined) {
    if (typeof _t65.maxHeight !== "number") errs.push(((p) + ".maxHeight") + ": 期望 number，实收 " + typeof _t65.maxHeight);
    }
    if (_t65.createTooltip !== undefined) {
    if (typeof _t65.createTooltip !== "string") errs.push(((p) + ".createTooltip") + ": 期望 string，实收 " + typeof _t65.createTooltip);
    }
    if (_t65.switcher !== undefined) {
    if (!Array.isArray(_t65.switcher)) errs.push(((p) + ".switcher") + ": 期望数组");
    else {
      for (let _t68 = 0; _t68 < _t65.switcher.length; _t68++) {
          chkPanelSwitcherGroup(_t65.switcher[_t68], (((p) + ".switcher") + "[" + _t68 + "]"), errs);
      }
    }
    }
    if (_t65.emptyText !== undefined) {
    if (typeof _t65.emptyText !== "string") errs.push(((p) + ".emptyText") + ": 期望 string，实收 " + typeof _t65.emptyText);
    }
    if (_t65.emptyHint !== undefined) {
    if (typeof _t65.emptyHint !== "string") errs.push(((p) + ".emptyHint") + ": 期望 string，实收 " + typeof _t65.emptyHint);
    }
  }
}
function chkPoolStatusBarItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t74 = v as Record<string, unknown>;
    if (typeof _t74.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t74.id);
    if (typeof _t74.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t74.pluginId);
    if (_t74.icon !== undefined) {
    if (typeof _t74.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t74.icon);
    }
    if (typeof _t74.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t74.label);
    if (_t74.title !== undefined) {
    if (typeof _t74.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t74.title);
    }
    if (!(_t74.align === "left" || _t74.align === "right")) errs.push(((p) + ".align") + ": 期望 left|right");
    if (_t74.onClick !== undefined) {
    if (typeof _t74.onClick !== "string") errs.push(((p) + ".onClick") + ": 期望 string，实收 " + typeof _t74.onClick);
    }
    if (_t74.component !== undefined) {
    if (!(_t74.component === false || _t74.component === true)) errs.push(((p) + ".component") + ": 期望 false|true");
    }
    if (_t74.dividerBefore !== undefined) {
    if (!(_t74.dividerBefore === false || _t74.dividerBefore === true)) errs.push(((p) + ".dividerBefore") + ": 期望 false|true");
    }
  }
}
function chkNotifAction(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t81 = v as Record<string, unknown>;
    if (typeof _t81.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t81.label);
    if (_t81.isPrimary !== undefined) {
    if (!(_t81.isPrimary === false || _t81.isPrimary === true)) errs.push(((p) + ".isPrimary") + ": 期望 false|true");
    }
  }
}
function chkNotifItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t79 = v as Record<string, unknown>;
    if (typeof _t79.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t79.id);
    if (typeof _t79.iconClass !== "string") errs.push(((p) + ".iconClass") + ": 期望 string，实收 " + typeof _t79.iconClass);
    if (typeof _t79.message !== "string") errs.push(((p) + ".message") + ": 期望 string，实收 " + typeof _t79.message);
    if (typeof _t79.timeLabel !== "string") errs.push(((p) + ".timeLabel") + ": 期望 string，实收 " + typeof _t79.timeLabel);
    if (_t79.sourceLabel !== undefined) {
    if (typeof _t79.sourceLabel !== "string") errs.push(((p) + ".sourceLabel") + ": 期望 string，实收 " + typeof _t79.sourceLabel);
    }
    if (!Array.isArray(_t79.actions)) errs.push(((p) + ".actions") + ": 期望数组");
    else {
      for (let _t80 = 0; _t80 < _t79.actions.length; _t80++) {
          chkNotifAction(_t79.actions[_t80], (((p) + ".actions") + "[" + _t80 + "]"), errs);
      }
    }
  }
}
function chkNotifGroup(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t77 = v as Record<string, unknown>;
    if (typeof _t77.key !== "string") errs.push(((p) + ".key") + ": 期望 string，实收 " + typeof _t77.key);
    if (typeof _t77.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t77.label);
    if (typeof _t77.unread !== "number") errs.push(((p) + ".unread") + ": 期望 number，实收 " + typeof _t77.unread);
    if (!Array.isArray(_t77.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t78 = 0; _t78 < _t77.items.length; _t78++) {
          chkNotifItem(_t77.items[_t78], (((p) + ".items") + "[" + _t78 + "]"), errs);
      }
    }
  }
}
function chkNotifLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t75 = v as Record<string, unknown>;
    if (typeof _t75.unread !== "number") errs.push(((p) + ".unread") + ": 期望 number，实收 " + typeof _t75.unread);
    if (typeof _t75.bellTitle !== "string") errs.push(((p) + ".bellTitle") + ": 期望 string，实收 " + typeof _t75.bellTitle);
    if (typeof _t75.panelTitle !== "string") errs.push(((p) + ".panelTitle") + ": 期望 string，实收 " + typeof _t75.panelTitle);
    if (typeof _t75.clearLabel !== "string") errs.push(((p) + ".clearLabel") + ": 期望 string，实收 " + typeof _t75.clearLabel);
    if (typeof _t75.emptyLabel !== "string") errs.push(((p) + ".emptyLabel") + ": 期望 string，实收 " + typeof _t75.emptyLabel);
    if (typeof _t75.dismissTitle !== "string") errs.push(((p) + ".dismissTitle") + ": 期望 string，实收 " + typeof _t75.dismissTitle);
    if (!Array.isArray(_t75.groups)) errs.push(((p) + ".groups") + ": 期望数组");
    else {
      for (let _t76 = 0; _t76 < _t75.groups.length; _t76++) {
          chkNotifGroup(_t75.groups[_t76], (((p) + ".groups") + "[" + _t76 + "]"), errs);
      }
    }
  }
}
function chkStatusBarLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t72 = v as Record<string, unknown>;
    if (!Array.isArray(_t72.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t73 = 0; _t73 < _t72.items.length; _t73++) {
          chkPoolStatusBarItem(_t72.items[_t73], (((p) + ".items") + "[" + _t73 + "]"), errs);
      }
    }
    if (_t72.chordLabel !== undefined) {
    if (typeof _t72.chordLabel !== "string") errs.push(((p) + ".chordLabel") + ": 期望 string，实收 " + typeof _t72.chordLabel);
    }
    chkNotifLayout(_t72.notif, ((p) + ".notif"), errs);
  }
}
function chkPoolLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t15 = v as Record<string, unknown>;
    if (_t15.version !== 2) errs.push(((p) + ".version") + ": 期望 2");
    chkTitleBarLayout(_t15.titleBar, ((p) + ".titleBar"), errs);
    chkIconBarLayout(_t15.iconBar, ((p) + ".iconBar"), errs);
    chkSidebarLayout(_t15.sidebar, ((p) + ".sidebar"), errs);
    if (_t15.rightSidebar !== undefined) {
    chkSidebarLayout(_t15.rightSidebar, ((p) + ".rightSidebar"), errs);
    }
    if (!Array.isArray(_t15.groups)) errs.push(((p) + ".groups") + ": 期望数组");
    else {
      for (let _t52 = 0; _t52 < _t15.groups.length; _t52++) {
          chkPoolGroup(_t15.groups[_t52], (((p) + ".groups") + "[" + _t52 + "]"), errs);
      }
    }
    if (_t15.activeGroupId !== undefined) {
    if (typeof _t15.activeGroupId !== "string") errs.push(((p) + ".activeGroupId") + ": 期望 string，实收 " + typeof _t15.activeGroupId);
    }
    if (_t15.root !== undefined) {
    chkSplitNode(_t15.root, ((p) + ".root"), errs);
    }
    if (_t15.creatableViews !== undefined) {
    if (!Array.isArray(_t15.creatableViews)) errs.push(((p) + ".creatableViews") + ": 期望数组");
    else {
      for (let _t63 = 0; _t63 < _t15.creatableViews.length; _t63++) {
          chkCreatableViewMeta(_t15.creatableViews[_t63], (((p) + ".creatableViews") + "[" + _t63 + "]"), errs);
      }
    }
    }
    if (_t15.panel !== undefined) {
    chkPanelLayout(_t15.panel, ((p) + ".panel"), errs);
    }
    chkStatusBarLayout(_t15.statusBar, ((p) + ".statusBar"), errs);
  }
}
function chkPoolQuickPickButton(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t86 = v as Record<string, unknown>;
    if (typeof _t86.actionId !== "string") errs.push(((p) + ".actionId") + ": 期望 string，实收 " + typeof _t86.actionId);
    if (typeof _t86.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t86.icon);
    if (_t86.tooltip !== undefined) {
    if (typeof _t86.tooltip !== "string") errs.push(((p) + ".tooltip") + ": 期望 string，实收 " + typeof _t86.tooltip);
    }
  }
}
function chkPoolQuickPickItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t84 = v as Record<string, unknown>;
    if (typeof _t84.key !== "string") errs.push(((p) + ".key") + ": 期望 string，实收 " + typeof _t84.key);
    if (typeof _t84.searchText !== "string") errs.push(((p) + ".searchText") + ": 期望 string，实收 " + typeof _t84.searchText);
    if (_t84.checked !== undefined) {
    if (!(_t84.checked === false || _t84.checked === true)) errs.push(((p) + ".checked") + ": 期望 false|true");
    }
    if (typeof _t84.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t84.label);
    if (_t84.category !== undefined) {
    if (typeof _t84.category !== "string") errs.push(((p) + ".category") + ": 期望 string，实收 " + typeof _t84.category);
    }
    if (_t84.detail !== undefined) {
    if (typeof _t84.detail !== "string") errs.push(((p) + ".detail") + ": 期望 string，实收 " + typeof _t84.detail);
    }
    if (_t84.keybinding !== undefined) {
    if (typeof _t84.keybinding !== "string") errs.push(((p) + ".keybinding") + ": 期望 string，实收 " + typeof _t84.keybinding);
    }
    if (_t84.buttons !== undefined) {
    if (!Array.isArray(_t84.buttons)) errs.push(((p) + ".buttons") + ": 期望数组");
    else {
      for (let _t85 = 0; _t85 < _t84.buttons.length; _t85++) {
          chkPoolQuickPickButton(_t84.buttons[_t85], (((p) + ".buttons") + "[" + _t85 + "]"), errs);
      }
    }
    }
  }
}
function chkPoolQuickPickData(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t82 = v as Record<string, unknown>;
    if (!(_t82.open === false || _t82.open === true)) errs.push(((p) + ".open") + ": 期望 false|true");
    if (typeof _t82.placeholder !== "string") errs.push(((p) + ".placeholder") + ": 期望 string，实收 " + typeof _t82.placeholder);
    if (_t82.prefix !== undefined) {
    if (typeof _t82.prefix !== "string") errs.push(((p) + ".prefix") + ": 期望 string，实收 " + typeof _t82.prefix);
    }
    if (!Array.isArray(_t82.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t83 = 0; _t83 < _t82.items.length; _t83++) {
          chkPoolQuickPickItem(_t82.items[_t83], (((p) + ".items") + "[" + _t83 + "]"), errs);
      }
    }
  }
}
function chkPoolToastButton(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t91 = v as Record<string, unknown>;
    if (typeof _t91.actionId !== "string") errs.push(((p) + ".actionId") + ": 期望 string，实收 " + typeof _t91.actionId);
    if (typeof _t91.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t91.label);
    if (_t91.isPrimary !== undefined) {
    if (!(_t91.isPrimary === false || _t91.isPrimary === true)) errs.push(((p) + ".isPrimary") + ": 期望 false|true");
    }
  }
}
function chkPoolToastItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t89 = v as Record<string, unknown>;
    if (typeof _t89.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t89.id);
    if (typeof _t89.message !== "string") errs.push(((p) + ".message") + ": 期望 string，实收 " + typeof _t89.message);
    if (typeof _t89.iconClass !== "string") errs.push(((p) + ".iconClass") + ": 期望 string，实收 " + typeof _t89.iconClass);
    if (_t89.sourceText !== undefined) {
    if (typeof _t89.sourceText !== "string") errs.push(((p) + ".sourceText") + ": 期望 string，实收 " + typeof _t89.sourceText);
    }
    if (_t89.actions !== undefined) {
    if (!Array.isArray(_t89.actions)) errs.push(((p) + ".actions") + ": 期望数组");
    else {
      for (let _t90 = 0; _t90 < _t89.actions.length; _t90++) {
          chkPoolToastButton(_t89.actions[_t90], (((p) + ".actions") + "[" + _t90 + "]"), errs);
      }
    }
    }
  }
}
function chkPoolToastData(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t87 = v as Record<string, unknown>;
    if (!Array.isArray(_t87.toasts)) errs.push(((p) + ".toasts") + ": 期望数组");
    else {
      for (let _t88 = 0; _t88 < _t87.toasts.length; _t88++) {
          chkPoolToastItem(_t87.toasts[_t88], (((p) + ".toasts") + "[" + _t88 + "]"), errs);
      }
    }
    if (!(_t87.suppressed === false || _t87.suppressed === true)) errs.push(((p) + ".suppressed") + ": 期望 false|true");
  }
}
function chkPoolDialogData(v: unknown, p: string, errs: string[]): void {
  const _t92: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t92.push((p) + ": 期望 object");
    else {
      const _t93 = v as Record<string, unknown>;
      if (_t93.open !== false) _t92.push(((p) + ".open") + ": 期望 false");
    }
  const _t94 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).open === false ? 1 : 0)) : 0);
  if (_t92.length > 0) {
  const _t95: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t95.push((p) + ": 期望 object");
    else {
      const _t96 = v as Record<string, unknown>;
      if (_t96.open !== true) _t95.push(((p) + ".open") + ": 期望 true");
      if (typeof _t96.title !== "string") _t95.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t96.title);
      if (typeof _t96.message !== "string") _t95.push(((p) + ".message") + ": 期望 string，实收 " + typeof _t96.message);
      if (_t96.confirmLabel !== undefined) {
      if (typeof _t96.confirmLabel !== "string") _t95.push(((p) + ".confirmLabel") + ": 期望 string，实收 " + typeof _t96.confirmLabel);
      }
      if (_t96.cancelLabel !== undefined) {
      if (typeof _t96.cancelLabel !== "string") _t95.push(((p) + ".cancelLabel") + ": 期望 string，实收 " + typeof _t96.cancelLabel);
      }
      if (!(_t96.isAlert === false || _t96.isAlert === true)) _t95.push(((p) + ".isAlert") + ": 期望 false|true");
    }
  const _t97 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).open === true ? 1 : 0) + (((v as Record<string, unknown>).isAlert === false) || ((v as Record<string, unknown>).isAlert === true) ? 1 : 0)) : 0);
  const _t98 = [{ e: _t92, s: _t94 }, { e: _t95, s: _t97 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t98.length > 0) errs.push(..._t98);
  }
}

// ── 断言函数（注册表每 DTO 一个，返回错误串数组）──
export function assertConfigurationChangedPayload(v: unknown): string[] {
  const errs: string[] = [];
  chkConfigurationChangedPayload(v, "payload", errs);
  return errs;
}
export function assertThemeChangedPayload(v: unknown): string[] {
  const errs: string[] = [];
  chkThemeChangedPayload(v, "payload", errs);
  return errs;
}
export function assertAccentChangedPayload(v: unknown): string[] {
  const errs: string[] = [];
  chkAccentChangedPayload(v, "payload", errs);
  return errs;
}
export function assertPluginStateChangedPayload(v: unknown): string[] {
  const errs: string[] = [];
  chkPluginStateChangedPayload(v, "payload", errs);
  return errs;
}
export function assertTabActivatedPayload(v: unknown): string[] {
  const errs: string[] = [];
  chkTabActivatedPayload(v, "payload", errs);
  return errs;
}
export function assertWorkspaceActiveChangedPayload(v: unknown): string[] {
  const errs: string[] = [];
  chkWorkspaceActiveChangedPayload(v, "payload", errs);
  return errs;
}
export function assertSettingsRequestGroupPayload(v: unknown): string[] {
  const errs: string[] = [];
  chkSettingsRequestGroupPayload(v, "payload", errs);
  return errs;
}
export function assertSettingsScrollToPayload(v: unknown): string[] {
  const errs: string[] = [];
  chkSettingsScrollToPayload(v, "payload", errs);
  return errs;
}
export function assertSerialDataPayload(v: unknown): string[] {
  const errs: string[] = [];
  chkSerialDataPayload(v, "payload", errs);
  return errs;
}
export function assertSerialStatsPayload(v: unknown): string[] {
  const errs: string[] = [];
  chkSerialStatsPayload(v, "payload", errs);
  return errs;
}
export function assertSerialSystemPayload(v: unknown): string[] {
  const errs: string[] = [];
  chkSerialSystemPayload(v, "payload", errs);
  return errs;
}
export function assertPoolLayout(v: unknown): string[] {
  const errs: string[] = [];
  chkPoolLayout(v, "payload", errs);
  return errs;
}
export function assertPoolQuickPickData(v: unknown): string[] {
  const errs: string[] = [];
  chkPoolQuickPickData(v, "payload", errs);
  return errs;
}
export function assertPoolToastData(v: unknown): string[] {
  const errs: string[] = [];
  chkPoolToastData(v, "payload", errs);
  return errs;
}
export function assertPoolDialogData(v: unknown): string[] {
  const errs: string[] = [];
  chkPoolDialogData(v, "payload", errs);
  return errs;
}

/** 通道 → 断言查表——未注册通道返回 null（无断言，安全降级）。never-throw（调用方决定上报） */
export function validateWire(channel: string, payload: unknown): string[] | null {
  switch (channel) {
    case "config:changed": return assertConfigurationChangedPayload(payload);
    case "theme:changed": return assertThemeChangedPayload(payload);
    case "accent:changed": return assertAccentChangedPayload(payload);
    case "plugin-state:changed": return assertPluginStateChangedPayload(payload);
    case "tab:activated": return assertTabActivatedPayload(payload);
    case "workspace:activeChanged": return assertWorkspaceActiveChangedPayload(payload);
    case "settings:requestGroup": return assertSettingsRequestGroupPayload(payload);
    case "settings:scrollTo": return assertSettingsScrollToPayload(payload);
    case "serial:data": return assertSerialDataPayload(payload);
    case "serial:stats": return assertSerialStatsPayload(payload);
    case "serial:system": return assertSerialSystemPayload(payload);
    case "pool:layout": return assertPoolLayout(payload);
    case "pool:quickpick": return assertPoolQuickPickData(payload);
    case "pool:toast": return assertPoolToastData(payload);
    case "pool:dialog": return assertPoolDialogData(payload);
    default: return null;
  }
}
