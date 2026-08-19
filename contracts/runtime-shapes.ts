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
function chkSerialStats(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t12 = v as Record<string, unknown>;
    if (_t12.tx !== undefined) {
    if (typeof _t12.tx !== "number") errs.push(((p) + ".tx") + ": 期望 number，实收 " + typeof _t12.tx);
    }
    if (_t12.rx !== undefined) {
    if (typeof _t12.rx !== "number") errs.push(((p) + ".rx") + ": 期望 number，实收 " + typeof _t12.rx);
    }
  }
}
function chkPoolMenuItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t18 = v as Record<string, unknown>;
    if (typeof _t18.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t18.label);
    if (typeof _t18.command !== "string") errs.push(((p) + ".command") + ": 期望 string，实收 " + typeof _t18.command);
    if (_t18.shortcut !== undefined) {
    if (typeof _t18.shortcut !== "string") errs.push(((p) + ".shortcut") + ": 期望 string，实收 " + typeof _t18.shortcut);
    }
    if (_t18.disabled !== undefined) {
    if (!(_t18.disabled === false || _t18.disabled === true)) errs.push(((p) + ".disabled") + ": 期望 false|true");
    }
    if (_t18.children !== undefined) {
    if (!Array.isArray(_t18.children)) errs.push(((p) + ".children") + ": 期望数组");
    else {
      for (let _t19 = 0; _t19 < _t18.children.length; _t19++) {
          chkPoolMenuItem(_t18.children[_t19], (((p) + ".children") + "[" + _t19 + "]"), errs);
      }
    }
    }
  }
}
function chkPoolMenuGroup(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t16 = v as Record<string, unknown>;
    if (typeof _t16.group !== "string") errs.push(((p) + ".group") + ": 期望 string，实收 " + typeof _t16.group);
    if (typeof _t16.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t16.label);
    if (!Array.isArray(_t16.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t17 = 0; _t17 < _t16.items.length; _t17++) {
          chkPoolMenuItem(_t16.items[_t17], (((p) + ".items") + "[" + _t17 + "]"), errs);
      }
    }
  }
}
function chkTitleBarSlotButton(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t22 = v as Record<string, unknown>;
    if (typeof _t22.command !== "string") errs.push(((p) + ".command") + ": 期望 string，实收 " + typeof _t22.command);
    if (_t22.icon !== undefined) {
    if (typeof _t22.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t22.icon);
    }
    if (typeof _t22.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t22.title);
  }
}
function chkTitleBarLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t14 = v as Record<string, unknown>;
    if (typeof _t14.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t14.title);
    if (typeof _t14.logoUrl !== "string") errs.push(((p) + ".logoUrl") + ": 期望 string，实收 " + typeof _t14.logoUrl);
    if (!(_t14.menuBarVisible === false || _t14.menuBarVisible === true)) errs.push(((p) + ".menuBarVisible") + ": 期望 false|true");
    if (!Array.isArray(_t14.menuGroups)) errs.push(((p) + ".menuGroups") + ": 期望数组");
    else {
      for (let _t15 = 0; _t15 < _t14.menuGroups.length; _t15++) {
          chkPoolMenuGroup(_t14.menuGroups[_t15], (((p) + ".menuGroups") + "[" + _t15 + "]"), errs);
      }
    }
    if (_t14.slots === null || typeof _t14.slots !== "object" || Array.isArray(_t14.slots)) errs.push(((p) + ".slots") + ": 期望 object");
    else {
      const _t20 = _t14.slots as Record<string, unknown>;
      if (!Array.isArray(_t20.left)) errs.push((((p) + ".slots") + ".left") + ": 期望数组");
      else {
        for (let _t21 = 0; _t21 < _t20.left.length; _t21++) {
            chkTitleBarSlotButton(_t20.left[_t21], ((((p) + ".slots") + ".left") + "[" + _t21 + "]"), errs);
        }
      }
      if (!Array.isArray(_t20.right)) errs.push((((p) + ".slots") + ".right") + ": 期望数组");
      else {
        for (let _t23 = 0; _t23 < _t20.right.length; _t23++) {
            chkTitleBarSlotButton(_t20.right[_t23], ((((p) + ".slots") + ".right") + "[" + _t23 + "]"), errs);
        }
      }
    }
    if (_t14.windowControls === null || typeof _t14.windowControls !== "object" || Array.isArray(_t14.windowControls)) errs.push(((p) + ".windowControls") + ": 期望 object");
    else {
      const _t24 = _t14.windowControls as Record<string, unknown>;
      if (typeof _t24.minimize !== "string") errs.push((((p) + ".windowControls") + ".minimize") + ": 期望 string，实收 " + typeof _t24.minimize);
      if (typeof _t24.maximize !== "string") errs.push((((p) + ".windowControls") + ".maximize") + ": 期望 string，实收 " + typeof _t24.maximize);
      if (typeof _t24.restore !== "string") errs.push((((p) + ".windowControls") + ".restore") + ": 期望 string，实收 " + typeof _t24.restore);
      if (typeof _t24.close !== "string") errs.push((((p) + ".windowControls") + ".close") + ": 期望 string，实收 " + typeof _t24.close);
    }
  }
}
function chkIconBarIcon(v: unknown, p: string, errs: string[]): void {
  const _t28: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t28.push((p) + ": 期望 object");
    else {
      const _t29 = v as Record<string, unknown>;
      if (_t29.kind !== "lucide") _t28.push(((p) + ".kind") + ": 期望 lucide");
      if (typeof _t29.name !== "string") _t28.push(((p) + ".name") + ": 期望 string，实收 " + typeof _t29.name);
    }
  const _t30 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).kind === "lucide" ? 1 : 0)) : 0);
  if (_t28.length > 0) {
  const _t31: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t31.push((p) + ": 期望 object");
    else {
      const _t32 = v as Record<string, unknown>;
      if (_t32.kind !== "codicon") _t31.push(((p) + ".kind") + ": 期望 codicon");
      if (typeof _t32.name !== "string") _t31.push(((p) + ".name") + ": 期望 string，实收 " + typeof _t32.name);
    }
  const _t33 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).kind === "codicon" ? 1 : 0)) : 0);
  if (_t31.length > 0) {
  const _t34: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t34.push((p) + ": 期望 object");
    else {
      const _t35 = v as Record<string, unknown>;
      if (_t35.kind !== "img") _t34.push(((p) + ".kind") + ": 期望 img");
      if (typeof _t35.src !== "string") _t34.push(((p) + ".src") + ": 期望 string，实收 " + typeof _t35.src);
    }
  const _t36 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).kind === "img" ? 1 : 0)) : 0);
  if (_t34.length > 0) {
  const _t37: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t37.push((p) + ": 期望 object");
    else {
      const _t38 = v as Record<string, unknown>;
      if (_t38.kind !== "emoji") _t37.push(((p) + ".kind") + ": 期望 emoji");
      if (typeof _t38.text !== "string") _t37.push(((p) + ".text") + ": 期望 string，实收 " + typeof _t38.text);
    }
  const _t39 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).kind === "emoji" ? 1 : 0)) : 0);
  const _t40 = [{ e: _t28, s: _t30 }, { e: _t31, s: _t33 }, { e: _t34, s: _t36 }, { e: _t37, s: _t39 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t40.length > 0) errs.push(..._t40);
  }
  }
  }
}
function chkIconBarItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t27 = v as Record<string, unknown>;
    if (typeof _t27.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t27.pluginId);
    chkIconBarIcon(_t27.icon, ((p) + ".icon"), errs);
    if (typeof _t27.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t27.label);
    if (!(_t27.location === "top" || _t27.location === "bottom")) errs.push(((p) + ".location") + ": 期望 top|bottom");
  }
}
function chkIconBarLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t25 = v as Record<string, unknown>;
    if (!Array.isArray(_t25.icons)) errs.push(((p) + ".icons") + ": 期望数组");
    else {
      for (let _t26 = 0; _t26 < _t25.icons.length; _t26++) {
          chkIconBarItem(_t25.icons[_t26], (((p) + ".icons") + "[" + _t26 + "]"), errs);
      }
    }
    if (_t25.activePluginId !== undefined) {
    if (typeof _t25.activePluginId !== "string") errs.push(((p) + ".activePluginId") + ": 期望 string，实收 " + typeof _t25.activePluginId);
    }
    if (!(_t25.hamburgerVisible === false || _t25.hamburgerVisible === true)) errs.push(((p) + ".hamburgerVisible") + ": 期望 false|true");
    if (typeof _t25.navLabel !== "string") errs.push(((p) + ".navLabel") + ": 期望 string，实收 " + typeof _t25.navLabel);
    if (_t25.hamburger !== undefined) {
    if (_t25.hamburger === null || typeof _t25.hamburger !== "object" || Array.isArray(_t25.hamburger)) errs.push(((p) + ".hamburger") + ": 期望 object");
    else {
      const _t41 = _t25.hamburger as Record<string, unknown>;
      if (typeof _t41.title !== "string") errs.push((((p) + ".hamburger") + ".title") + ": 期望 string，实收 " + typeof _t41.title);
      if (!Array.isArray(_t41.groups)) errs.push((((p) + ".hamburger") + ".groups") + ": 期望数组");
      else {
        for (let _t42 = 0; _t42 < _t41.groups.length; _t42++) {
            chkPoolMenuGroup(_t41.groups[_t42], ((((p) + ".hamburger") + ".groups") + "[" + _t42 + "]"), errs);
        }
      }
    }
    }
  }
}
function chkSidebarViewMeta(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t45 = v as Record<string, unknown>;
    if (typeof _t45.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t45.id);
    if (typeof _t45.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t45.title);
    if (typeof _t45.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t45.pluginId);
    if (typeof _t45.renderPath !== "string") errs.push(((p) + ".renderPath") + ": 期望 string，实收 " + typeof _t45.renderPath);
    if (_t45.role !== undefined) {
    if (!(_t45.role === "toolbar" || _t45.role === "section")) errs.push(((p) + ".role") + ": 期望 toolbar|section");
    }
    if (_t45.order !== undefined) {
    if (typeof _t45.order !== "number") errs.push(((p) + ".order") + ": 期望 number，实收 " + typeof _t45.order);
    }
    if (_t45.collapsed !== undefined) {
    if (!(_t45.collapsed === false || _t45.collapsed === true)) errs.push(((p) + ".collapsed") + ": 期望 false|true");
    }
    if (_t45.badge !== undefined) {
    if (!(typeof _t45.badge === "string" || typeof _t45.badge === "number")) errs.push(((p) + ".badge") + ": 期望 string|number");
    }
    if (_t45.titleDescription !== undefined) {
    if (typeof _t45.titleDescription !== "string") errs.push(((p) + ".titleDescription") + ": 期望 string，实收 " + typeof _t45.titleDescription);
    }
    if (_t45.titleTooltip !== undefined) {
    if (typeof _t45.titleTooltip !== "string") errs.push(((p) + ".titleTooltip") + ": 期望 string，实收 " + typeof _t45.titleTooltip);
    }
    if (_t45.singleViewPaneContainerTitle !== undefined) {
    if (typeof _t45.singleViewPaneContainerTitle !== "string") errs.push(((p) + ".singleViewPaneContainerTitle") + ": 期望 string，实收 " + typeof _t45.singleViewPaneContainerTitle);
    }
    if (_t45.minHeight !== undefined) {
    if (typeof _t45.minHeight !== "number") errs.push(((p) + ".minHeight") + ": 期望 number，实收 " + typeof _t45.minHeight);
    }
  }
}
function chkSidebarContainerLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t47 = v as Record<string, unknown>;
    if (typeof _t47.containerId !== "string") errs.push(((p) + ".containerId") + ": 期望 string，实收 " + typeof _t47.containerId);
    if (typeof _t47.containerTitle !== "string") errs.push(((p) + ".containerTitle") + ": 期望 string，实收 " + typeof _t47.containerTitle);
    if (_t47.mergeHeaderWhenSingle !== undefined) {
    if (!(_t47.mergeHeaderWhenSingle === false || _t47.mergeHeaderWhenSingle === true)) errs.push(((p) + ".mergeHeaderWhenSingle") + ": 期望 false|true");
    }
    if (!Array.isArray(_t47.views)) errs.push(((p) + ".views") + ": 期望数组");
    else {
      for (let _t48 = 0; _t48 < _t47.views.length; _t48++) {
          chkSidebarViewMeta(_t47.views[_t48], (((p) + ".views") + "[" + _t48 + "]"), errs);
      }
    }
  }
}
function chkSidebarLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t43 = v as Record<string, unknown>;
    if (!(_t43.visible === false || _t43.visible === true)) errs.push(((p) + ".visible") + ": 期望 false|true");
    if (typeof _t43.width !== "number") errs.push(((p) + ".width") + ": 期望 number，实收 " + typeof _t43.width);
    if (!(_t43.containerId === null || typeof _t43.containerId === "string")) errs.push(((p) + ".containerId") + ": 期望 null|string");
    if (typeof _t43.containerTitle !== "string") errs.push(((p) + ".containerTitle") + ": 期望 string，实收 " + typeof _t43.containerTitle);
    if (_t43.mergeHeaderWhenSingle !== undefined) {
    if (!(_t43.mergeHeaderWhenSingle === false || _t43.mergeHeaderWhenSingle === true)) errs.push(((p) + ".mergeHeaderWhenSingle") + ": 期望 false|true");
    }
    if (!Array.isArray(_t43.views)) errs.push(((p) + ".views") + ": 期望数组");
    else {
      for (let _t44 = 0; _t44 < _t43.views.length; _t44++) {
          chkSidebarViewMeta(_t43.views[_t44], (((p) + ".views") + "[" + _t44 + "]"), errs);
      }
    }
    if (_t43.containers !== undefined) {
    if (!Array.isArray(_t43.containers)) errs.push(((p) + ".containers") + ": 期望数组");
    else {
      for (let _t46 = 0; _t46 < _t43.containers.length; _t46++) {
          chkSidebarContainerLayout(_t43.containers[_t46], (((p) + ".containers") + "[" + _t46 + "]"), errs);
      }
    }
    }
    if (_t43.collapsedViews !== undefined) {
    if (!Array.isArray(_t43.collapsedViews)) errs.push(((p) + ".collapsedViews") + ": 期望数组");
    else {
      for (let _t49 = 0; _t49 < _t43.collapsedViews.length; _t49++) {
          if (typeof _t43.collapsedViews[_t49] !== "string") errs.push((((p) + ".collapsedViews") + "[" + _t49 + "]") + ": 期望 string，实收 " + typeof _t43.collapsedViews[_t49]);
      }
    }
    }
    if (_t43.collapsed !== undefined) {
    if (!(_t43.collapsed === false || _t43.collapsed === true)) errs.push(((p) + ".collapsed") + ": 期望 false|true");
    }
    if (_t43.emptyText !== undefined) {
    if (typeof _t43.emptyText !== "string") errs.push(((p) + ".emptyText") + ": 期望 string，实收 " + typeof _t43.emptyText);
    }
    if (_t43.emptyHint !== undefined) {
    if (typeof _t43.emptyHint !== "string") errs.push(((p) + ".emptyHint") + ": 期望 string，实收 " + typeof _t43.emptyHint);
    }
    if (_t43.expandTooltip !== undefined) {
    if (typeof _t43.expandTooltip !== "string") errs.push(((p) + ".expandTooltip") + ": 期望 string，实收 " + typeof _t43.expandTooltip);
    }
    if (_t43.collapseTooltip !== undefined) {
    if (typeof _t43.collapseTooltip !== "string") errs.push(((p) + ".collapseTooltip") + ": 期望 string，实收 " + typeof _t43.collapseTooltip);
    }
    if (_t43.minWidth !== undefined) {
    if (typeof _t43.minWidth !== "number") errs.push(((p) + ".minWidth") + ": 期望 number，实收 " + typeof _t43.minWidth);
    }
    if (_t43.maxWidth !== undefined) {
    if (typeof _t43.maxWidth !== "number") errs.push(((p) + ".maxWidth") + ": 期望 number，实收 " + typeof _t43.maxWidth);
    }
    if (_t43.viewId !== undefined) {
    if (!(_t43.viewId === null || typeof _t43.viewId === "string")) errs.push(((p) + ".viewId") + ": 期望 null|string");
    }
  }
}
function chkPoolTab(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t53 = v as Record<string, unknown>;
    if (typeof _t53.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t53.id);
    if (typeof _t53.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t53.pluginId);
    if (typeof _t53.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t53.title);
    if (_t53.sourceId !== undefined) {
    if (typeof _t53.sourceId !== "string") errs.push(((p) + ".sourceId") + ": 期望 string，实收 " + typeof _t53.sourceId);
    }
    if (_t53.dirty !== undefined) {
    if (!(_t53.dirty === false || _t53.dirty === true)) errs.push(((p) + ".dirty") + ": 期望 false|true");
    }
    if (_t53.icon !== undefined) {
    if (typeof _t53.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t53.icon);
    }
    if (_t53.pinned !== undefined) {
    if (!(_t53.pinned === false || _t53.pinned === true)) errs.push(((p) + ".pinned") + ": 期望 false|true");
    }
    if (_t53.closeBehavior !== undefined) {
    if (!(_t53.closeBehavior === "normal" || _t53.closeBehavior === "confirm" || _t53.closeBehavior === "blocked")) errs.push(((p) + ".closeBehavior") + ": 期望 normal|confirm|blocked");
    }
    if (_t53.singleton !== undefined) {
    if (!(_t53.singleton === false || _t53.singleton === true)) errs.push(((p) + ".singleton") + ": 期望 false|true");
    }
    if (_t53.shellRendered !== undefined) {
    if (!(_t53.shellRendered === false || _t53.shellRendered === true)) errs.push(((p) + ".shellRendered") + ": 期望 false|true");
    }
    if (_t53.shellType !== undefined) {
    if (typeof _t53.shellType !== "string") errs.push(((p) + ".shellType") + ": 期望 string，实收 " + typeof _t53.shellType);
    }
    if (_t53.detailPluginId !== undefined) {
    if (typeof _t53.detailPluginId !== "string") errs.push(((p) + ".detailPluginId") + ": 期望 string，实收 " + typeof _t53.detailPluginId);
    }
  }
}
function chkPoolGroup(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t51 = v as Record<string, unknown>;
    if (typeof _t51.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t51.id);
    if (typeof _t51.flex !== "number") errs.push(((p) + ".flex") + ": 期望 number，实收 " + typeof _t51.flex);
    if (typeof _t51.activeTabId !== "string") errs.push(((p) + ".activeTabId") + ": 期望 string，实收 " + typeof _t51.activeTabId);
    if (!Array.isArray(_t51.tabs)) errs.push(((p) + ".tabs") + ": 期望数组");
    else {
      for (let _t52 = 0; _t52 < _t51.tabs.length; _t52++) {
          chkPoolTab(_t51.tabs[_t52], (((p) + ".tabs") + "[" + _t52 + "]"), errs);
      }
    }
  }
}
function chkSplitNode(v: unknown, p: string, errs: string[]): void {
  const _t54: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t54.push((p) + ": 期望 object");
    else {
      const _t55 = v as Record<string, unknown>;
      if (_t55.type !== "leaf") _t54.push(((p) + ".type") + ": 期望 leaf");
      if (typeof _t55.groupId !== "string") _t54.push(((p) + ".groupId") + ": 期望 string，实收 " + typeof _t55.groupId);
    }
  const _t56 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "leaf" ? 1 : 0)) : 0);
  if (_t54.length > 0) {
  const _t57: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t57.push((p) + ": 期望 object");
    else {
      const _t58 = v as Record<string, unknown>;
      if (_t58.type !== "branch") _t57.push(((p) + ".type") + ": 期望 branch");
      if (!(_t58.direction === "horizontal" || _t58.direction === "vertical")) _t57.push(((p) + ".direction") + ": 期望 horizontal|vertical");
      if (!Array.isArray(_t58.children)) _t57.push(((p) + ".children") + ": 期望数组");
      else {
        if (_t58.children.length !== 2) _t57.push(((p) + ".children") + ": 期望长度 2");
          chkSplitNode(_t58.children[0], (((p) + ".children") + "[0]"), _t57);
          chkSplitNode(_t58.children[1], (((p) + ".children") + "[1]"), _t57);
      }
      if (!Array.isArray(_t58.sizes)) _t57.push(((p) + ".sizes") + ": 期望数组");
      else {
        if (_t58.sizes.length !== 2) _t57.push(((p) + ".sizes") + ": 期望长度 2");
          if (typeof _t58.sizes[0] !== "number") _t57.push((((p) + ".sizes") + "[0]") + ": 期望 number，实收 " + typeof _t58.sizes[0]);
          if (typeof _t58.sizes[1] !== "number") _t57.push((((p) + ".sizes") + "[1]") + ": 期望 number，实收 " + typeof _t58.sizes[1]);
      }
    }
  const _t59 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "branch" ? 1 : 0) + (((v as Record<string, unknown>).direction === "horizontal") || ((v as Record<string, unknown>).direction === "vertical") ? 1 : 0)) : 0);
  const _t60 = [{ e: _t54, s: _t56 }, { e: _t57, s: _t59 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t60.length > 0) errs.push(..._t60);
  }
}
function chkCreatableViewMeta(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t62 = v as Record<string, unknown>;
    if (typeof _t62.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t62.pluginId);
    if (typeof _t62.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t62.label);
  }
}
function chkPanelViewMeta(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t65 = v as Record<string, unknown>;
    if (typeof _t65.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t65.id);
    if (typeof _t65.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t65.title);
    if (typeof _t65.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t65.pluginId);
    if (typeof _t65.renderPath !== "string") errs.push(((p) + ".renderPath") + ": 期望 string，实收 " + typeof _t65.renderPath);
  }
}
function chkPanelLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t63 = v as Record<string, unknown>;
    if (!(_t63.visible === false || _t63.visible === true)) errs.push(((p) + ".visible") + ": 期望 false|true");
    if (typeof _t63.height !== "number") errs.push(((p) + ".height") + ": 期望 number，实收 " + typeof _t63.height);
    if (typeof _t63.activeViewId !== "string") errs.push(((p) + ".activeViewId") + ": 期望 string，实收 " + typeof _t63.activeViewId);
    if (!Array.isArray(_t63.views)) errs.push(((p) + ".views") + ": 期望数组");
    else {
      for (let _t64 = 0; _t64 < _t63.views.length; _t64++) {
          chkPanelViewMeta(_t63.views[_t64], (((p) + ".views") + "[" + _t64 + "]"), errs);
      }
    }
    if (_t63.minHeight !== undefined) {
    if (typeof _t63.minHeight !== "number") errs.push(((p) + ".minHeight") + ": 期望 number，实收 " + typeof _t63.minHeight);
    }
    if (_t63.maxHeight !== undefined) {
    if (typeof _t63.maxHeight !== "number") errs.push(((p) + ".maxHeight") + ": 期望 number，实收 " + typeof _t63.maxHeight);
    }
    if (_t63.createTooltip !== undefined) {
    if (typeof _t63.createTooltip !== "string") errs.push(((p) + ".createTooltip") + ": 期望 string，实收 " + typeof _t63.createTooltip);
    }
  }
}
function chkPoolStatusBarItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t68 = v as Record<string, unknown>;
    if (typeof _t68.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t68.id);
    if (typeof _t68.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t68.pluginId);
    if (_t68.icon !== undefined) {
    if (typeof _t68.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t68.icon);
    }
    if (typeof _t68.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t68.label);
    if (_t68.title !== undefined) {
    if (typeof _t68.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t68.title);
    }
    if (!(_t68.align === "left" || _t68.align === "right")) errs.push(((p) + ".align") + ": 期望 left|right");
    if (_t68.onClick !== undefined) {
    if (typeof _t68.onClick !== "string") errs.push(((p) + ".onClick") + ": 期望 string，实收 " + typeof _t68.onClick);
    }
    if (_t68.component !== undefined) {
    if (!(_t68.component === false || _t68.component === true)) errs.push(((p) + ".component") + ": 期望 false|true");
    }
    if (_t68.dividerBefore !== undefined) {
    if (!(_t68.dividerBefore === false || _t68.dividerBefore === true)) errs.push(((p) + ".dividerBefore") + ": 期望 false|true");
    }
  }
}
function chkNotifAction(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t75 = v as Record<string, unknown>;
    if (typeof _t75.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t75.label);
    if (_t75.isPrimary !== undefined) {
    if (!(_t75.isPrimary === false || _t75.isPrimary === true)) errs.push(((p) + ".isPrimary") + ": 期望 false|true");
    }
  }
}
function chkNotifItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t73 = v as Record<string, unknown>;
    if (typeof _t73.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t73.id);
    if (typeof _t73.iconClass !== "string") errs.push(((p) + ".iconClass") + ": 期望 string，实收 " + typeof _t73.iconClass);
    if (typeof _t73.message !== "string") errs.push(((p) + ".message") + ": 期望 string，实收 " + typeof _t73.message);
    if (typeof _t73.timeLabel !== "string") errs.push(((p) + ".timeLabel") + ": 期望 string，实收 " + typeof _t73.timeLabel);
    if (_t73.sourceLabel !== undefined) {
    if (typeof _t73.sourceLabel !== "string") errs.push(((p) + ".sourceLabel") + ": 期望 string，实收 " + typeof _t73.sourceLabel);
    }
    if (!Array.isArray(_t73.actions)) errs.push(((p) + ".actions") + ": 期望数组");
    else {
      for (let _t74 = 0; _t74 < _t73.actions.length; _t74++) {
          chkNotifAction(_t73.actions[_t74], (((p) + ".actions") + "[" + _t74 + "]"), errs);
      }
    }
  }
}
function chkNotifGroup(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t71 = v as Record<string, unknown>;
    if (typeof _t71.key !== "string") errs.push(((p) + ".key") + ": 期望 string，实收 " + typeof _t71.key);
    if (typeof _t71.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t71.label);
    if (typeof _t71.unread !== "number") errs.push(((p) + ".unread") + ": 期望 number，实收 " + typeof _t71.unread);
    if (!Array.isArray(_t71.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t72 = 0; _t72 < _t71.items.length; _t72++) {
          chkNotifItem(_t71.items[_t72], (((p) + ".items") + "[" + _t72 + "]"), errs);
      }
    }
  }
}
function chkNotifLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t69 = v as Record<string, unknown>;
    if (typeof _t69.unread !== "number") errs.push(((p) + ".unread") + ": 期望 number，实收 " + typeof _t69.unread);
    if (typeof _t69.bellTitle !== "string") errs.push(((p) + ".bellTitle") + ": 期望 string，实收 " + typeof _t69.bellTitle);
    if (typeof _t69.panelTitle !== "string") errs.push(((p) + ".panelTitle") + ": 期望 string，实收 " + typeof _t69.panelTitle);
    if (typeof _t69.clearLabel !== "string") errs.push(((p) + ".clearLabel") + ": 期望 string，实收 " + typeof _t69.clearLabel);
    if (typeof _t69.emptyLabel !== "string") errs.push(((p) + ".emptyLabel") + ": 期望 string，实收 " + typeof _t69.emptyLabel);
    if (typeof _t69.dismissTitle !== "string") errs.push(((p) + ".dismissTitle") + ": 期望 string，实收 " + typeof _t69.dismissTitle);
    if (!Array.isArray(_t69.groups)) errs.push(((p) + ".groups") + ": 期望数组");
    else {
      for (let _t70 = 0; _t70 < _t69.groups.length; _t70++) {
          chkNotifGroup(_t69.groups[_t70], (((p) + ".groups") + "[" + _t70 + "]"), errs);
      }
    }
  }
}
function chkStatusBarLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t66 = v as Record<string, unknown>;
    if (!Array.isArray(_t66.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t67 = 0; _t67 < _t66.items.length; _t67++) {
          chkPoolStatusBarItem(_t66.items[_t67], (((p) + ".items") + "[" + _t67 + "]"), errs);
      }
    }
    if (_t66.chordLabel !== undefined) {
    if (typeof _t66.chordLabel !== "string") errs.push(((p) + ".chordLabel") + ": 期望 string，实收 " + typeof _t66.chordLabel);
    }
    chkNotifLayout(_t66.notif, ((p) + ".notif"), errs);
  }
}
function chkPoolLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t13 = v as Record<string, unknown>;
    if (_t13.version !== 2) errs.push(((p) + ".version") + ": 期望 2");
    chkTitleBarLayout(_t13.titleBar, ((p) + ".titleBar"), errs);
    chkIconBarLayout(_t13.iconBar, ((p) + ".iconBar"), errs);
    chkSidebarLayout(_t13.sidebar, ((p) + ".sidebar"), errs);
    if (_t13.rightSidebar !== undefined) {
    chkSidebarLayout(_t13.rightSidebar, ((p) + ".rightSidebar"), errs);
    }
    if (!Array.isArray(_t13.groups)) errs.push(((p) + ".groups") + ": 期望数组");
    else {
      for (let _t50 = 0; _t50 < _t13.groups.length; _t50++) {
          chkPoolGroup(_t13.groups[_t50], (((p) + ".groups") + "[" + _t50 + "]"), errs);
      }
    }
    if (_t13.root !== undefined) {
    chkSplitNode(_t13.root, ((p) + ".root"), errs);
    }
    if (_t13.creatableViews !== undefined) {
    if (!Array.isArray(_t13.creatableViews)) errs.push(((p) + ".creatableViews") + ": 期望数组");
    else {
      for (let _t61 = 0; _t61 < _t13.creatableViews.length; _t61++) {
          chkCreatableViewMeta(_t13.creatableViews[_t61], (((p) + ".creatableViews") + "[" + _t61 + "]"), errs);
      }
    }
    }
    if (_t13.panel !== undefined) {
    chkPanelLayout(_t13.panel, ((p) + ".panel"), errs);
    }
    chkStatusBarLayout(_t13.statusBar, ((p) + ".statusBar"), errs);
  }
}
function chkPoolQuickPickButton(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t80 = v as Record<string, unknown>;
    if (typeof _t80.actionId !== "string") errs.push(((p) + ".actionId") + ": 期望 string，实收 " + typeof _t80.actionId);
    if (typeof _t80.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t80.icon);
    if (_t80.tooltip !== undefined) {
    if (typeof _t80.tooltip !== "string") errs.push(((p) + ".tooltip") + ": 期望 string，实收 " + typeof _t80.tooltip);
    }
  }
}
function chkPoolQuickPickItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t78 = v as Record<string, unknown>;
    if (typeof _t78.key !== "string") errs.push(((p) + ".key") + ": 期望 string，实收 " + typeof _t78.key);
    if (typeof _t78.searchText !== "string") errs.push(((p) + ".searchText") + ": 期望 string，实收 " + typeof _t78.searchText);
    if (typeof _t78.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t78.label);
    if (_t78.category !== undefined) {
    if (typeof _t78.category !== "string") errs.push(((p) + ".category") + ": 期望 string，实收 " + typeof _t78.category);
    }
    if (_t78.detail !== undefined) {
    if (typeof _t78.detail !== "string") errs.push(((p) + ".detail") + ": 期望 string，实收 " + typeof _t78.detail);
    }
    if (_t78.keybinding !== undefined) {
    if (typeof _t78.keybinding !== "string") errs.push(((p) + ".keybinding") + ": 期望 string，实收 " + typeof _t78.keybinding);
    }
    if (_t78.buttons !== undefined) {
    if (!Array.isArray(_t78.buttons)) errs.push(((p) + ".buttons") + ": 期望数组");
    else {
      for (let _t79 = 0; _t79 < _t78.buttons.length; _t79++) {
          chkPoolQuickPickButton(_t78.buttons[_t79], (((p) + ".buttons") + "[" + _t79 + "]"), errs);
      }
    }
    }
  }
}
function chkPoolQuickPickData(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t76 = v as Record<string, unknown>;
    if (!(_t76.open === false || _t76.open === true)) errs.push(((p) + ".open") + ": 期望 false|true");
    if (typeof _t76.placeholder !== "string") errs.push(((p) + ".placeholder") + ": 期望 string，实收 " + typeof _t76.placeholder);
    if (_t76.prefix !== undefined) {
    if (typeof _t76.prefix !== "string") errs.push(((p) + ".prefix") + ": 期望 string，实收 " + typeof _t76.prefix);
    }
    if (!Array.isArray(_t76.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t77 = 0; _t77 < _t76.items.length; _t77++) {
          chkPoolQuickPickItem(_t76.items[_t77], (((p) + ".items") + "[" + _t77 + "]"), errs);
      }
    }
  }
}
function chkPoolToastButton(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t85 = v as Record<string, unknown>;
    if (typeof _t85.actionId !== "string") errs.push(((p) + ".actionId") + ": 期望 string，实收 " + typeof _t85.actionId);
    if (typeof _t85.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t85.label);
    if (_t85.isPrimary !== undefined) {
    if (!(_t85.isPrimary === false || _t85.isPrimary === true)) errs.push(((p) + ".isPrimary") + ": 期望 false|true");
    }
  }
}
function chkPoolToastItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t83 = v as Record<string, unknown>;
    if (typeof _t83.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t83.id);
    if (typeof _t83.message !== "string") errs.push(((p) + ".message") + ": 期望 string，实收 " + typeof _t83.message);
    if (typeof _t83.iconClass !== "string") errs.push(((p) + ".iconClass") + ": 期望 string，实收 " + typeof _t83.iconClass);
    if (_t83.sourceText !== undefined) {
    if (typeof _t83.sourceText !== "string") errs.push(((p) + ".sourceText") + ": 期望 string，实收 " + typeof _t83.sourceText);
    }
    if (_t83.actions !== undefined) {
    if (!Array.isArray(_t83.actions)) errs.push(((p) + ".actions") + ": 期望数组");
    else {
      for (let _t84 = 0; _t84 < _t83.actions.length; _t84++) {
          chkPoolToastButton(_t83.actions[_t84], (((p) + ".actions") + "[" + _t84 + "]"), errs);
      }
    }
    }
  }
}
function chkPoolToastData(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t81 = v as Record<string, unknown>;
    if (!Array.isArray(_t81.toasts)) errs.push(((p) + ".toasts") + ": 期望数组");
    else {
      for (let _t82 = 0; _t82 < _t81.toasts.length; _t82++) {
          chkPoolToastItem(_t81.toasts[_t82], (((p) + ".toasts") + "[" + _t82 + "]"), errs);
      }
    }
    if (!(_t81.suppressed === false || _t81.suppressed === true)) errs.push(((p) + ".suppressed") + ": 期望 false|true");
  }
}
function chkPoolDialogData(v: unknown, p: string, errs: string[]): void {
  const _t86: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t86.push((p) + ": 期望 object");
    else {
      const _t87 = v as Record<string, unknown>;
      if (_t87.open !== false) _t86.push(((p) + ".open") + ": 期望 false");
    }
  const _t88 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).open === false ? 1 : 0)) : 0);
  if (_t86.length > 0) {
  const _t89: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t89.push((p) + ": 期望 object");
    else {
      const _t90 = v as Record<string, unknown>;
      if (_t90.open !== true) _t89.push(((p) + ".open") + ": 期望 true");
      if (typeof _t90.title !== "string") _t89.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t90.title);
      if (typeof _t90.message !== "string") _t89.push(((p) + ".message") + ": 期望 string，实收 " + typeof _t90.message);
      if (_t90.confirmLabel !== undefined) {
      if (typeof _t90.confirmLabel !== "string") _t89.push(((p) + ".confirmLabel") + ": 期望 string，实收 " + typeof _t90.confirmLabel);
      }
      if (_t90.cancelLabel !== undefined) {
      if (typeof _t90.cancelLabel !== "string") _t89.push(((p) + ".cancelLabel") + ": 期望 string，实收 " + typeof _t90.cancelLabel);
      }
      if (!(_t90.isAlert === false || _t90.isAlert === true)) _t89.push(((p) + ".isAlert") + ": 期望 false|true");
    }
  const _t91 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).open === true ? 1 : 0) + (((v as Record<string, unknown>).isAlert === false) || ((v as Record<string, unknown>).isAlert === true) ? 1 : 0)) : 0);
  const _t92 = [{ e: _t86, s: _t88 }, { e: _t89, s: _t91 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t92.length > 0) errs.push(..._t92);
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
export function assertSerialStats(v: unknown): string[] {
  const errs: string[] = [];
  chkSerialStats(v, "payload", errs);
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
    case "serial:stats": return assertSerialStats(payload);
    case "pool:layout": return assertPoolLayout(payload);
    case "pool:quickpick": return assertPoolQuickPickData(payload);
    case "pool:toast": return assertPoolToastData(payload);
    case "pool:dialog": return assertPoolDialogData(payload);
    default: return null;
  }
}
