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
function chkFontFaceSpec(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t5 = v as Record<string, unknown>;
    if (typeof _t5.family !== "string") errs.push(((p) + ".family") + ": 期望 string，实收 " + typeof _t5.family);
    if (typeof _t5.url !== "string") errs.push(((p) + ".url") + ": 期望 string，实收 " + typeof _t5.url);
    if (_t5.format !== undefined) {
    if (typeof _t5.format !== "string") errs.push(((p) + ".format") + ": 期望 string，实收 " + typeof _t5.format);
    }
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
    if (_t1.fontFaces !== undefined) {
    if (!Array.isArray(_t1.fontFaces)) errs.push(((p) + ".fontFaces") + ": 期望数组");
    else {
      for (let _t4 = 0; _t4 < _t1.fontFaces.length; _t4++) {
          chkFontFaceSpec(_t1.fontFaces[_t4], (((p) + ".fontFaces") + "[" + _t4 + "]"), errs);
      }
    }
    }
    if (_t1.recipeId !== undefined) {
    if (typeof _t1.recipeId !== "string") errs.push(((p) + ".recipeId") + ": 期望 string，实收 " + typeof _t1.recipeId);
    }
    if (_t1.colorwayId !== undefined) {
    if (typeof _t1.colorwayId !== "string") errs.push(((p) + ".colorwayId") + ": 期望 string，实收 " + typeof _t1.colorwayId);
    }
    if (_t1.domains !== undefined) {
    if (!Array.isArray(_t1.domains)) errs.push(((p) + ".domains") + ": 期望数组");
    else {
      for (let _t6 = 0; _t6 < _t1.domains.length; _t6++) {
          if (!(_t1.domains[_t6] === "colors" || _t1.domains[_t6] === "font" || _t1.domains[_t6] === "radius" || _t1.domains[_t6] === "glass" || _t1.domains[_t6] === "background")) errs.push((((p) + ".domains") + "[" + _t6 + "]") + ": 期望 colors|font|radius|glass|background");
      }
    }
    }
  }
}
function chkAccentChangedPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t7 = v as Record<string, unknown>;
    if (_t7.variables === null || typeof _t7.variables !== "object" || Array.isArray(_t7.variables)) errs.push(((p) + ".variables") + ": 期望 object");
    else {
      const _t8 = _t7.variables as Record<string, unknown>;
      for (const _t9 of Object.keys(_t8)) {
      if (typeof _t8[_t9] !== "string") errs.push((((p) + ".variables") + "[\"" + _t9 + "\"]") + ": 期望 string，实收 " + typeof _t8[_t9]);
      }
    }
  }
}
function chkPluginStateChangedPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t10 = v as Record<string, unknown>;
    if (typeof _t10.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t10.pluginId);
    if (typeof _t10.key !== "string") errs.push(((p) + ".key") + ": 期望 string，实收 " + typeof _t10.key);
  }
}
function chkTabActivatedPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t11 = v as Record<string, unknown>;
    if (typeof _t11.tabId !== "string") errs.push(((p) + ".tabId") + ": 期望 string，实收 " + typeof _t11.tabId);
    if (typeof _t11.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t11.pluginId);
    if (_t11.filePath !== undefined) {
    if (typeof _t11.filePath !== "string") errs.push(((p) + ".filePath") + ": 期望 string，实收 " + typeof _t11.filePath);
    }
  }
}
function chkWorkspaceActiveChangedPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t12 = v as Record<string, unknown>;
    if (typeof _t12.uri !== "string") errs.push(((p) + ".uri") + ": 期望 string，实收 " + typeof _t12.uri);
  }
}
function chkSettingsRequestGroupPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t13 = v as Record<string, unknown>;
    if (typeof _t13.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t13.pluginId);
  }
}
function chkSettingsScrollToPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t14 = v as Record<string, unknown>;
    if (typeof _t14.key !== "string") errs.push(((p) + ".key") + ": 期望 string，实收 " + typeof _t14.key);
  }
}
function chkSerialDataPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t15 = v as Record<string, unknown>;
    if (typeof _t15.portName !== "string") errs.push(((p) + ".portName") + ": 期望 string，实收 " + typeof _t15.portName);
    if (typeof _t15.text !== "string") errs.push(((p) + ".text") + ": 期望 string，实收 " + typeof _t15.text);
  }
}
function chkSerialStatsPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t16 = v as Record<string, unknown>;
    if (typeof _t16.portName !== "string") errs.push(((p) + ".portName") + ": 期望 string，实收 " + typeof _t16.portName);
    if (_t16.tx !== undefined) {
    if (typeof _t16.tx !== "number") errs.push(((p) + ".tx") + ": 期望 number，实收 " + typeof _t16.tx);
    }
    if (_t16.rx !== undefined) {
    if (typeof _t16.rx !== "number") errs.push(((p) + ".rx") + ": 期望 number，实收 " + typeof _t16.rx);
    }
  }
}
function chkSerialSystemPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t17 = v as Record<string, unknown>;
    if (typeof _t17.portName !== "string") errs.push(((p) + ".portName") + ": 期望 string，实收 " + typeof _t17.portName);
    if (typeof _t17.message !== "string") errs.push(((p) + ".message") + ": 期望 string，实收 " + typeof _t17.message);
    if (!(_t17.type === "status" || _t17.type === "error")) errs.push(((p) + ".type") + ": 期望 status|error");
  }
}
function chkPoolMenuItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t23 = v as Record<string, unknown>;
    if (typeof _t23.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t23.label);
    if (typeof _t23.command !== "string") errs.push(((p) + ".command") + ": 期望 string，实收 " + typeof _t23.command);
    if (_t23.shortcut !== undefined) {
    if (typeof _t23.shortcut !== "string") errs.push(((p) + ".shortcut") + ": 期望 string，实收 " + typeof _t23.shortcut);
    }
    if (_t23.checked !== undefined) {
    if (!(_t23.checked === false || _t23.checked === true)) errs.push(((p) + ".checked") + ": 期望 false|true");
    }
    if (_t23.children !== undefined) {
    if (!Array.isArray(_t23.children)) errs.push(((p) + ".children") + ": 期望数组");
    else {
      for (let _t24 = 0; _t24 < _t23.children.length; _t24++) {
          chkPoolMenuItem(_t23.children[_t24], (((p) + ".children") + "[" + _t24 + "]"), errs);
      }
    }
    }
  }
}
function chkPoolMenuGroup(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t21 = v as Record<string, unknown>;
    if (typeof _t21.group !== "string") errs.push(((p) + ".group") + ": 期望 string，实收 " + typeof _t21.group);
    if (typeof _t21.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t21.label);
    if (!Array.isArray(_t21.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t22 = 0; _t22 < _t21.items.length; _t22++) {
          chkPoolMenuItem(_t21.items[_t22], (((p) + ".items") + "[" + _t22 + "]"), errs);
      }
    }
  }
}
function chkTitleBarSlotButton(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t27 = v as Record<string, unknown>;
    if (typeof _t27.command !== "string") errs.push(((p) + ".command") + ": 期望 string，实收 " + typeof _t27.command);
    if (_t27.icon !== undefined) {
    if (typeof _t27.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t27.icon);
    }
    if (typeof _t27.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t27.title);
  }
}
function chkTitleBarLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t19 = v as Record<string, unknown>;
    if (typeof _t19.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t19.title);
    if (typeof _t19.logoUrl !== "string") errs.push(((p) + ".logoUrl") + ": 期望 string，实收 " + typeof _t19.logoUrl);
    if (!(_t19.menuBarVisible === false || _t19.menuBarVisible === true)) errs.push(((p) + ".menuBarVisible") + ": 期望 false|true");
    if (!Array.isArray(_t19.menuGroups)) errs.push(((p) + ".menuGroups") + ": 期望数组");
    else {
      for (let _t20 = 0; _t20 < _t19.menuGroups.length; _t20++) {
          chkPoolMenuGroup(_t19.menuGroups[_t20], (((p) + ".menuGroups") + "[" + _t20 + "]"), errs);
      }
    }
    if (_t19.slots === null || typeof _t19.slots !== "object" || Array.isArray(_t19.slots)) errs.push(((p) + ".slots") + ": 期望 object");
    else {
      const _t25 = _t19.slots as Record<string, unknown>;
      if (!Array.isArray(_t25.left)) errs.push((((p) + ".slots") + ".left") + ": 期望数组");
      else {
        for (let _t26 = 0; _t26 < _t25.left.length; _t26++) {
            chkTitleBarSlotButton(_t25.left[_t26], ((((p) + ".slots") + ".left") + "[" + _t26 + "]"), errs);
        }
      }
      if (!Array.isArray(_t25.right)) errs.push((((p) + ".slots") + ".right") + ": 期望数组");
      else {
        for (let _t28 = 0; _t28 < _t25.right.length; _t28++) {
            chkTitleBarSlotButton(_t25.right[_t28], ((((p) + ".slots") + ".right") + "[" + _t28 + "]"), errs);
        }
      }
    }
    if (_t19.windowControls === null || typeof _t19.windowControls !== "object" || Array.isArray(_t19.windowControls)) errs.push(((p) + ".windowControls") + ": 期望 object");
    else {
      const _t29 = _t19.windowControls as Record<string, unknown>;
      if (typeof _t29.minimize !== "string") errs.push((((p) + ".windowControls") + ".minimize") + ": 期望 string，实收 " + typeof _t29.minimize);
      if (typeof _t29.maximize !== "string") errs.push((((p) + ".windowControls") + ".maximize") + ": 期望 string，实收 " + typeof _t29.maximize);
      if (typeof _t29.restore !== "string") errs.push((((p) + ".windowControls") + ".restore") + ": 期望 string，实收 " + typeof _t29.restore);
      if (typeof _t29.close !== "string") errs.push((((p) + ".windowControls") + ".close") + ": 期望 string，实收 " + typeof _t29.close);
      if (typeof _t29.pin !== "string") errs.push((((p) + ".windowControls") + ".pin") + ": 期望 string，实收 " + typeof _t29.pin);
      if (typeof _t29.unpin !== "string") errs.push((((p) + ".windowControls") + ".unpin") + ": 期望 string，实收 " + typeof _t29.unpin);
    }
  }
}
function chkIconBarIcon(v: unknown, p: string, errs: string[]): void {
  const _t33: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t33.push((p) + ": 期望 object");
    else {
      const _t34 = v as Record<string, unknown>;
      if (_t34.kind !== "lucide") _t33.push(((p) + ".kind") + ": 期望 lucide");
      if (typeof _t34.name !== "string") _t33.push(((p) + ".name") + ": 期望 string，实收 " + typeof _t34.name);
    }
  const _t35 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).kind === "lucide" ? 1 : 0)) : 0);
  if (_t33.length > 0) {
  const _t36: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t36.push((p) + ": 期望 object");
    else {
      const _t37 = v as Record<string, unknown>;
      if (_t37.kind !== "codicon") _t36.push(((p) + ".kind") + ": 期望 codicon");
      if (typeof _t37.name !== "string") _t36.push(((p) + ".name") + ": 期望 string，实收 " + typeof _t37.name);
      if (_t37.color !== undefined) {
      if (typeof _t37.color !== "string") _t36.push(((p) + ".color") + ": 期望 string，实收 " + typeof _t37.color);
      }
    }
  const _t38 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).kind === "codicon" ? 1 : 0)) : 0);
  if (_t36.length > 0) {
  const _t39: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t39.push((p) + ": 期望 object");
    else {
      const _t40 = v as Record<string, unknown>;
      if (_t40.kind !== "img") _t39.push(((p) + ".kind") + ": 期望 img");
      if (typeof _t40.src !== "string") _t39.push(((p) + ".src") + ": 期望 string，实收 " + typeof _t40.src);
    }
  const _t41 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).kind === "img" ? 1 : 0)) : 0);
  if (_t39.length > 0) {
  const _t42: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t42.push((p) + ": 期望 object");
    else {
      const _t43 = v as Record<string, unknown>;
      if (_t43.kind !== "emoji") _t42.push(((p) + ".kind") + ": 期望 emoji");
      if (typeof _t43.text !== "string") _t42.push(((p) + ".text") + ": 期望 string，实收 " + typeof _t43.text);
    }
  const _t44 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).kind === "emoji" ? 1 : 0)) : 0);
  const _t45 = [{ e: _t33, s: _t35 }, { e: _t36, s: _t38 }, { e: _t39, s: _t41 }, { e: _t42, s: _t44 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t45.length > 0) errs.push(..._t45);
  }
  }
  }
}
function chkIconBarItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t32 = v as Record<string, unknown>;
    if (typeof _t32.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t32.pluginId);
    chkIconBarIcon(_t32.icon, ((p) + ".icon"), errs);
    if (typeof _t32.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t32.label);
    if (!(_t32.location === "top" || _t32.location === "bottom")) errs.push(((p) + ".location") + ": 期望 top|bottom");
  }
}
function chkIconBarLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t30 = v as Record<string, unknown>;
    if (!Array.isArray(_t30.icons)) errs.push(((p) + ".icons") + ": 期望数组");
    else {
      for (let _t31 = 0; _t31 < _t30.icons.length; _t31++) {
          chkIconBarItem(_t30.icons[_t31], (((p) + ".icons") + "[" + _t31 + "]"), errs);
      }
    }
    if (_t30.activePluginId !== undefined) {
    if (typeof _t30.activePluginId !== "string") errs.push(((p) + ".activePluginId") + ": 期望 string，实收 " + typeof _t30.activePluginId);
    }
    if (!(_t30.hamburgerVisible === false || _t30.hamburgerVisible === true)) errs.push(((p) + ".hamburgerVisible") + ": 期望 false|true");
    if (typeof _t30.navLabel !== "string") errs.push(((p) + ".navLabel") + ": 期望 string，实收 " + typeof _t30.navLabel);
    if (_t30.hamburger !== undefined) {
    if (_t30.hamburger === null || typeof _t30.hamburger !== "object" || Array.isArray(_t30.hamburger)) errs.push(((p) + ".hamburger") + ": 期望 object");
    else {
      const _t46 = _t30.hamburger as Record<string, unknown>;
      if (typeof _t46.title !== "string") errs.push((((p) + ".hamburger") + ".title") + ": 期望 string，实收 " + typeof _t46.title);
      if (!Array.isArray(_t46.groups)) errs.push((((p) + ".hamburger") + ".groups") + ": 期望数组");
      else {
        for (let _t47 = 0; _t47 < _t46.groups.length; _t47++) {
            chkPoolMenuGroup(_t46.groups[_t47], ((((p) + ".hamburger") + ".groups") + "[" + _t47 + "]"), errs);
        }
      }
    }
    }
  }
}
function chkTitleActionItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t58 = v as Record<string, unknown>;
    if (typeof _t58.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t58.label);
    if (typeof _t58.command !== "string") errs.push(((p) + ".command") + ": 期望 string，实收 " + typeof _t58.command);
    if (_t58.args !== undefined) {
    }
  }
}
function chkTitleActionWidget(v: unknown, p: string, errs: string[]): void {
  const _t52: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t52.push((p) + ": 期望 object");
    else {
      const _t53 = v as Record<string, unknown>;
      if (_t53.type !== "icon") _t52.push(((p) + ".type") + ": 期望 icon");
      if (typeof _t53.id !== "string") _t52.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t53.id);
      if (typeof _t53.command !== "string") _t52.push(((p) + ".command") + ": 期望 string，实收 " + typeof _t53.command);
      if (typeof _t53.icon !== "string") _t52.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t53.icon);
      if (typeof _t53.title !== "string") _t52.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t53.title);
      if (_t53.args !== undefined) {
      }
    }
  const _t54 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "icon" ? 1 : 0)) : 0);
  if (_t52.length > 0) {
  const _t55: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t55.push((p) + ": 期望 object");
    else {
      const _t56 = v as Record<string, unknown>;
      if (_t56.type !== "dropdown") _t55.push(((p) + ".type") + ": 期望 dropdown");
      if (typeof _t56.id !== "string") _t55.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t56.id);
      if (!Array.isArray(_t56.items)) _t55.push(((p) + ".items") + ": 期望数组");
      else {
        for (let _t57 = 0; _t57 < _t56.items.length; _t57++) {
            chkTitleActionItem(_t56.items[_t57], (((p) + ".items") + "[" + _t57 + "]"), _t55);
        }
      }
      if (_t56.title !== undefined) {
      if (typeof _t56.title !== "string") _t55.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t56.title);
      }
    }
  const _t59 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "dropdown" ? 1 : 0)) : 0);
  if (_t55.length > 0) {
  const _t60: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t60.push((p) + ": 期望 object");
    else {
      const _t61 = v as Record<string, unknown>;
      if (_t61.type !== "split") _t60.push(((p) + ".type") + ": 期望 split");
      if (typeof _t61.id !== "string") _t60.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t61.id);
      if (typeof _t61.command !== "string") _t60.push(((p) + ".command") + ": 期望 string，实收 " + typeof _t61.command);
      if (_t61.icon !== undefined) {
      if (typeof _t61.icon !== "string") _t60.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t61.icon);
      }
      if (typeof _t61.title !== "string") _t60.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t61.title);
      if (!Array.isArray(_t61.items)) _t60.push(((p) + ".items") + ": 期望数组");
      else {
        for (let _t62 = 0; _t62 < _t61.items.length; _t62++) {
            chkTitleActionItem(_t61.items[_t62], (((p) + ".items") + "[" + _t62 + "]"), _t60);
        }
      }
      if (_t61.args !== undefined) {
      }
    }
  const _t63 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "split" ? 1 : 0)) : 0);
  const _t64 = [{ e: _t52, s: _t54 }, { e: _t55, s: _t59 }, { e: _t60, s: _t63 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t64.length > 0) errs.push(..._t64);
  }
  }
}
function chkSidebarViewMeta(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t50 = v as Record<string, unknown>;
    if (typeof _t50.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t50.id);
    if (typeof _t50.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t50.title);
    if (typeof _t50.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t50.pluginId);
    if (typeof _t50.renderPath !== "string") errs.push(((p) + ".renderPath") + ": 期望 string，实收 " + typeof _t50.renderPath);
    if (_t50.role !== undefined) {
    if (!(_t50.role === "toolbar" || _t50.role === "section")) errs.push(((p) + ".role") + ": 期望 toolbar|section");
    }
    if (_t50.order !== undefined) {
    if (typeof _t50.order !== "number") errs.push(((p) + ".order") + ": 期望 number，实收 " + typeof _t50.order);
    }
    if (_t50.collapsed !== undefined) {
    if (!(_t50.collapsed === false || _t50.collapsed === true)) errs.push(((p) + ".collapsed") + ": 期望 false|true");
    }
    if (_t50.badge !== undefined) {
    if (!(typeof _t50.badge === "string" || typeof _t50.badge === "number")) errs.push(((p) + ".badge") + ": 期望 string|number");
    }
    if (_t50.titleDescription !== undefined) {
    if (typeof _t50.titleDescription !== "string") errs.push(((p) + ".titleDescription") + ": 期望 string，实收 " + typeof _t50.titleDescription);
    }
    if (_t50.titleTooltip !== undefined) {
    if (typeof _t50.titleTooltip !== "string") errs.push(((p) + ".titleTooltip") + ": 期望 string，实收 " + typeof _t50.titleTooltip);
    }
    if (_t50.singleViewPaneContainerTitle !== undefined) {
    if (typeof _t50.singleViewPaneContainerTitle !== "string") errs.push(((p) + ".singleViewPaneContainerTitle") + ": 期望 string，实收 " + typeof _t50.singleViewPaneContainerTitle);
    }
    if (_t50.minHeight !== undefined) {
    if (typeof _t50.minHeight !== "number") errs.push(((p) + ".minHeight") + ": 期望 number，实收 " + typeof _t50.minHeight);
    }
    if (_t50.titleActions !== undefined) {
    if (!Array.isArray(_t50.titleActions)) errs.push(((p) + ".titleActions") + ": 期望数组");
    else {
      for (let _t51 = 0; _t51 < _t50.titleActions.length; _t51++) {
          chkTitleActionWidget(_t50.titleActions[_t51], (((p) + ".titleActions") + "[" + _t51 + "]"), errs);
      }
    }
    }
  }
}
function chkSidebarContainerLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t66 = v as Record<string, unknown>;
    if (typeof _t66.containerId !== "string") errs.push(((p) + ".containerId") + ": 期望 string，实收 " + typeof _t66.containerId);
    if (typeof _t66.containerTitle !== "string") errs.push(((p) + ".containerTitle") + ": 期望 string，实收 " + typeof _t66.containerTitle);
    if (_t66.mergeHeaderWhenSingle !== undefined) {
    if (!(_t66.mergeHeaderWhenSingle === false || _t66.mergeHeaderWhenSingle === true)) errs.push(((p) + ".mergeHeaderWhenSingle") + ": 期望 false|true");
    }
    if (!Array.isArray(_t66.views)) errs.push(((p) + ".views") + ": 期望数组");
    else {
      for (let _t67 = 0; _t67 < _t66.views.length; _t67++) {
          chkSidebarViewMeta(_t66.views[_t67], (((p) + ".views") + "[" + _t67 + "]"), errs);
      }
    }
  }
}
function chkSidebarLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t48 = v as Record<string, unknown>;
    if (!(_t48.visible === false || _t48.visible === true)) errs.push(((p) + ".visible") + ": 期望 false|true");
    if (typeof _t48.width !== "number") errs.push(((p) + ".width") + ": 期望 number，实收 " + typeof _t48.width);
    if (_t48.edge !== undefined) {
    if (!(_t48.edge === "left" || _t48.edge === "right")) errs.push(((p) + ".edge") + ": 期望 left|right");
    }
    if (!(_t48.containerId === null || typeof _t48.containerId === "string")) errs.push(((p) + ".containerId") + ": 期望 null|string");
    if (typeof _t48.containerTitle !== "string") errs.push(((p) + ".containerTitle") + ": 期望 string，实收 " + typeof _t48.containerTitle);
    if (_t48.mergeHeaderWhenSingle !== undefined) {
    if (!(_t48.mergeHeaderWhenSingle === false || _t48.mergeHeaderWhenSingle === true)) errs.push(((p) + ".mergeHeaderWhenSingle") + ": 期望 false|true");
    }
    if (!Array.isArray(_t48.views)) errs.push(((p) + ".views") + ": 期望数组");
    else {
      for (let _t49 = 0; _t49 < _t48.views.length; _t49++) {
          chkSidebarViewMeta(_t48.views[_t49], (((p) + ".views") + "[" + _t49 + "]"), errs);
      }
    }
    if (_t48.containers !== undefined) {
    if (!Array.isArray(_t48.containers)) errs.push(((p) + ".containers") + ": 期望数组");
    else {
      for (let _t65 = 0; _t65 < _t48.containers.length; _t65++) {
          chkSidebarContainerLayout(_t48.containers[_t65], (((p) + ".containers") + "[" + _t65 + "]"), errs);
      }
    }
    }
    if (_t48.collapsedViews !== undefined) {
    if (!Array.isArray(_t48.collapsedViews)) errs.push(((p) + ".collapsedViews") + ": 期望数组");
    else {
      for (let _t68 = 0; _t68 < _t48.collapsedViews.length; _t68++) {
          if (typeof _t48.collapsedViews[_t68] !== "string") errs.push((((p) + ".collapsedViews") + "[" + _t68 + "]") + ": 期望 string，实收 " + typeof _t48.collapsedViews[_t68]);
      }
    }
    }
    if (_t48.collapsed !== undefined) {
    if (!(_t48.collapsed === false || _t48.collapsed === true)) errs.push(((p) + ".collapsed") + ": 期望 false|true");
    }
    if (_t48.emptyText !== undefined) {
    if (typeof _t48.emptyText !== "string") errs.push(((p) + ".emptyText") + ": 期望 string，实收 " + typeof _t48.emptyText);
    }
    if (_t48.emptyHint !== undefined) {
    if (typeof _t48.emptyHint !== "string") errs.push(((p) + ".emptyHint") + ": 期望 string，实收 " + typeof _t48.emptyHint);
    }
    if (_t48.minWidth !== undefined) {
    if (typeof _t48.minWidth !== "number") errs.push(((p) + ".minWidth") + ": 期望 number，实收 " + typeof _t48.minWidth);
    }
    if (_t48.maxWidth !== undefined) {
    if (typeof _t48.maxWidth !== "number") errs.push(((p) + ".maxWidth") + ": 期望 number，实收 " + typeof _t48.maxWidth);
    }
    if (_t48.viewId !== undefined) {
    if (!(_t48.viewId === null || typeof _t48.viewId === "string")) errs.push(((p) + ".viewId") + ": 期望 null|string");
    }
  }
}
function chkRightSidebarLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t69 = v as Record<string, unknown>;
    if (!(_t69.visible === false || _t69.visible === true)) errs.push(((p) + ".visible") + ": 期望 false|true");
    if (typeof _t69.width !== "number") errs.push(((p) + ".width") + ": 期望 number，实收 " + typeof _t69.width);
    if (!(_t69.containerId === null || typeof _t69.containerId === "string")) errs.push(((p) + ".containerId") + ": 期望 null|string");
    if (typeof _t69.containerTitle !== "string") errs.push(((p) + ".containerTitle") + ": 期望 string，实收 " + typeof _t69.containerTitle);
    if (_t69.mergeHeaderWhenSingle !== undefined) {
    if (!(_t69.mergeHeaderWhenSingle === false || _t69.mergeHeaderWhenSingle === true)) errs.push(((p) + ".mergeHeaderWhenSingle") + ": 期望 false|true");
    }
    if (!Array.isArray(_t69.views)) errs.push(((p) + ".views") + ": 期望数组");
    else {
      for (let _t70 = 0; _t70 < _t69.views.length; _t70++) {
          chkSidebarViewMeta(_t69.views[_t70], (((p) + ".views") + "[" + _t70 + "]"), errs);
      }
    }
    if (_t69.containers !== undefined) {
    if (!Array.isArray(_t69.containers)) errs.push(((p) + ".containers") + ": 期望数组");
    else {
      for (let _t71 = 0; _t71 < _t69.containers.length; _t71++) {
          chkSidebarContainerLayout(_t69.containers[_t71], (((p) + ".containers") + "[" + _t71 + "]"), errs);
      }
    }
    }
    if (_t69.collapsedViews !== undefined) {
    if (!Array.isArray(_t69.collapsedViews)) errs.push(((p) + ".collapsedViews") + ": 期望数组");
    else {
      for (let _t72 = 0; _t72 < _t69.collapsedViews.length; _t72++) {
          if (typeof _t69.collapsedViews[_t72] !== "string") errs.push((((p) + ".collapsedViews") + "[" + _t72 + "]") + ": 期望 string，实收 " + typeof _t69.collapsedViews[_t72]);
      }
    }
    }
    if (_t69.collapsed !== undefined) {
    if (!(_t69.collapsed === false || _t69.collapsed === true)) errs.push(((p) + ".collapsed") + ": 期望 false|true");
    }
    if (_t69.minWidth !== undefined) {
    if (typeof _t69.minWidth !== "number") errs.push(((p) + ".minWidth") + ": 期望 number，实收 " + typeof _t69.minWidth);
    }
    if (_t69.maxWidth !== undefined) {
    if (typeof _t69.maxWidth !== "number") errs.push(((p) + ".maxWidth") + ": 期望 number，实收 " + typeof _t69.maxWidth);
    }
    if (_t69.emptyText !== undefined) {
    if (typeof _t69.emptyText !== "string") errs.push(((p) + ".emptyText") + ": 期望 string，实收 " + typeof _t69.emptyText);
    }
    if (_t69.emptyHint !== undefined) {
    if (typeof _t69.emptyHint !== "string") errs.push(((p) + ".emptyHint") + ": 期望 string，实收 " + typeof _t69.emptyHint);
    }
  }
}
function chkPoolTab(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t76 = v as Record<string, unknown>;
    if (typeof _t76.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t76.id);
    if (typeof _t76.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t76.pluginId);
    if (typeof _t76.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t76.title);
    if (_t76.sourceId !== undefined) {
    if (typeof _t76.sourceId !== "string") errs.push(((p) + ".sourceId") + ": 期望 string，实收 " + typeof _t76.sourceId);
    }
    if (_t76.dirty !== undefined) {
    if (!(_t76.dirty === false || _t76.dirty === true)) errs.push(((p) + ".dirty") + ": 期望 false|true");
    }
    if (_t76.icon !== undefined) {
    chkIconBarIcon(_t76.icon, ((p) + ".icon"), errs);
    }
    if (_t76.pinned !== undefined) {
    if (!(_t76.pinned === false || _t76.pinned === true)) errs.push(((p) + ".pinned") + ": 期望 false|true");
    }
    if (_t76.closeBehavior !== undefined) {
    if (!(_t76.closeBehavior === "normal" || _t76.closeBehavior === "confirm" || _t76.closeBehavior === "blocked")) errs.push(((p) + ".closeBehavior") + ": 期望 normal|confirm|blocked");
    }
    if (_t76.singleton !== undefined) {
    if (!(_t76.singleton === false || _t76.singleton === true)) errs.push(((p) + ".singleton") + ": 期望 false|true");
    }
    if (_t76.shellRendered !== undefined) {
    if (!(_t76.shellRendered === false || _t76.shellRendered === true)) errs.push(((p) + ".shellRendered") + ": 期望 false|true");
    }
    if (_t76.shellType !== undefined) {
    if (typeof _t76.shellType !== "string") errs.push(((p) + ".shellType") + ": 期望 string，实收 " + typeof _t76.shellType);
    }
    if (_t76.detailPluginId !== undefined) {
    if (typeof _t76.detailPluginId !== "string") errs.push(((p) + ".detailPluginId") + ": 期望 string，实收 " + typeof _t76.detailPluginId);
    }
    if (_t76.detailContributorId !== undefined) {
    if (typeof _t76.detailContributorId !== "string") errs.push(((p) + ".detailContributorId") + ": 期望 string，实收 " + typeof _t76.detailContributorId);
    }
    if (_t76.detailViewRenderPath !== undefined) {
    if (typeof _t76.detailViewRenderPath !== "string") errs.push(((p) + ".detailViewRenderPath") + ": 期望 string，实收 " + typeof _t76.detailViewRenderPath);
    }
  }
}
function chkPoolGroup(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t74 = v as Record<string, unknown>;
    if (typeof _t74.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t74.id);
    if (typeof _t74.flex !== "number") errs.push(((p) + ".flex") + ": 期望 number，实收 " + typeof _t74.flex);
    if (typeof _t74.activeTabId !== "string") errs.push(((p) + ".activeTabId") + ": 期望 string，实收 " + typeof _t74.activeTabId);
    if (!Array.isArray(_t74.tabs)) errs.push(((p) + ".tabs") + ": 期望数组");
    else {
      for (let _t75 = 0; _t75 < _t74.tabs.length; _t75++) {
          chkPoolTab(_t74.tabs[_t75], (((p) + ".tabs") + "[" + _t75 + "]"), errs);
      }
    }
  }
}
function chkSplitNode(v: unknown, p: string, errs: string[]): void {
  const _t77: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t77.push((p) + ": 期望 object");
    else {
      const _t78 = v as Record<string, unknown>;
      if (_t78.type !== "leaf") _t77.push(((p) + ".type") + ": 期望 leaf");
      if (typeof _t78.groupId !== "string") _t77.push(((p) + ".groupId") + ": 期望 string，实收 " + typeof _t78.groupId);
    }
  const _t79 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "leaf" ? 1 : 0)) : 0);
  if (_t77.length > 0) {
  const _t80: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t80.push((p) + ": 期望 object");
    else {
      const _t81 = v as Record<string, unknown>;
      if (_t81.type !== "branch") _t80.push(((p) + ".type") + ": 期望 branch");
      if (!(_t81.direction === "horizontal" || _t81.direction === "vertical")) _t80.push(((p) + ".direction") + ": 期望 horizontal|vertical");
      if (!Array.isArray(_t81.children)) _t80.push(((p) + ".children") + ": 期望数组");
      else {
        if (_t81.children.length !== 2) _t80.push(((p) + ".children") + ": 期望长度 2");
          chkSplitNode(_t81.children[0], (((p) + ".children") + "[0]"), _t80);
          chkSplitNode(_t81.children[1], (((p) + ".children") + "[1]"), _t80);
      }
      if (!Array.isArray(_t81.sizes)) _t80.push(((p) + ".sizes") + ": 期望数组");
      else {
        if (_t81.sizes.length !== 2) _t80.push(((p) + ".sizes") + ": 期望长度 2");
          if (typeof _t81.sizes[0] !== "number") _t80.push((((p) + ".sizes") + "[0]") + ": 期望 number，实收 " + typeof _t81.sizes[0]);
          if (typeof _t81.sizes[1] !== "number") _t80.push((((p) + ".sizes") + "[1]") + ": 期望 number，实收 " + typeof _t81.sizes[1]);
      }
    }
  const _t82 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "branch" ? 1 : 0) + (((v as Record<string, unknown>).direction === "horizontal") || ((v as Record<string, unknown>).direction === "vertical") ? 1 : 0)) : 0);
  const _t83 = [{ e: _t77, s: _t79 }, { e: _t80, s: _t82 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t83.length > 0) errs.push(..._t83);
  }
}
function chkCreatableViewMeta(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t85 = v as Record<string, unknown>;
    if (typeof _t85.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t85.pluginId);
    if (typeof _t85.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t85.label);
  }
}
function chkPanelViewMeta(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t88 = v as Record<string, unknown>;
    if (typeof _t88.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t88.id);
    if (typeof _t88.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t88.title);
    if (typeof _t88.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t88.pluginId);
    if (typeof _t88.renderPath !== "string") errs.push(((p) + ".renderPath") + ": 期望 string，实收 " + typeof _t88.renderPath);
    if (_t88.titleActions !== undefined) {
    if (!Array.isArray(_t88.titleActions)) errs.push(((p) + ".titleActions") + ": 期望数组");
    else {
      for (let _t89 = 0; _t89 < _t88.titleActions.length; _t89++) {
          chkTitleActionWidget(_t88.titleActions[_t89], (((p) + ".titleActions") + "[" + _t89 + "]"), errs);
      }
    }
    }
  }
}
function chkPanelSwitcherItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t93 = v as Record<string, unknown>;
    if (typeof _t93.viewId !== "string") errs.push(((p) + ".viewId") + ": 期望 string，实收 " + typeof _t93.viewId);
    if (typeof _t93.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t93.title);
    if (typeof _t93.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t93.pluginId);
    if (!(_t93.visible === false || _t93.visible === true)) errs.push(((p) + ".visible") + ": 期望 false|true");
    if (!(_t93.active === false || _t93.active === true)) errs.push(((p) + ".active") + ": 期望 false|true");
  }
}
function chkPanelSwitcherGroup(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t91 = v as Record<string, unknown>;
    if (typeof _t91.containerId !== "string") errs.push(((p) + ".containerId") + ": 期望 string，实收 " + typeof _t91.containerId);
    if (typeof _t91.containerTitle !== "string") errs.push(((p) + ".containerTitle") + ": 期望 string，实收 " + typeof _t91.containerTitle);
    if (!Array.isArray(_t91.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t92 = 0; _t92 < _t91.items.length; _t92++) {
          chkPanelSwitcherItem(_t91.items[_t92], (((p) + ".items") + "[" + _t92 + "]"), errs);
      }
    }
  }
}
function chkPanelLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t86 = v as Record<string, unknown>;
    if (!(_t86.visible === false || _t86.visible === true)) errs.push(((p) + ".visible") + ": 期望 false|true");
    if (typeof _t86.height !== "number") errs.push(((p) + ".height") + ": 期望 number，实收 " + typeof _t86.height);
    if (_t86.edge !== undefined) {
    if (!(_t86.edge === "top" || _t86.edge === "bottom" || _t86.edge === "left" || _t86.edge === "right")) errs.push(((p) + ".edge") + ": 期望 top|bottom|left|right");
    }
    if (_t86.align !== undefined) {
    if (!(_t86.align === "left" || _t86.align === "right" || _t86.align === "center" || _t86.align === "justify")) errs.push(((p) + ".align") + ": 期望 left|right|center|justify");
    }
    if (_t86.width !== undefined) {
    if (typeof _t86.width !== "number") errs.push(((p) + ".width") + ": 期望 number，实收 " + typeof _t86.width);
    }
    if (typeof _t86.activeViewId !== "string") errs.push(((p) + ".activeViewId") + ": 期望 string，实收 " + typeof _t86.activeViewId);
    if (!Array.isArray(_t86.views)) errs.push(((p) + ".views") + ": 期望数组");
    else {
      for (let _t87 = 0; _t87 < _t86.views.length; _t87++) {
          chkPanelViewMeta(_t86.views[_t87], (((p) + ".views") + "[" + _t87 + "]"), errs);
      }
    }
    if (_t86.minHeight !== undefined) {
    if (typeof _t86.minHeight !== "number") errs.push(((p) + ".minHeight") + ": 期望 number，实收 " + typeof _t86.minHeight);
    }
    if (_t86.maxHeight !== undefined) {
    if (typeof _t86.maxHeight !== "number") errs.push(((p) + ".maxHeight") + ": 期望 number，实收 " + typeof _t86.maxHeight);
    }
    if (_t86.minWidth !== undefined) {
    if (typeof _t86.minWidth !== "number") errs.push(((p) + ".minWidth") + ": 期望 number，实收 " + typeof _t86.minWidth);
    }
    if (_t86.maxWidth !== undefined) {
    if (typeof _t86.maxWidth !== "number") errs.push(((p) + ".maxWidth") + ": 期望 number，实收 " + typeof _t86.maxWidth);
    }
    if (_t86.createTooltip !== undefined) {
    if (typeof _t86.createTooltip !== "string") errs.push(((p) + ".createTooltip") + ": 期望 string，实收 " + typeof _t86.createTooltip);
    }
    if (_t86.switcher !== undefined) {
    if (!Array.isArray(_t86.switcher)) errs.push(((p) + ".switcher") + ": 期望数组");
    else {
      for (let _t90 = 0; _t90 < _t86.switcher.length; _t90++) {
          chkPanelSwitcherGroup(_t86.switcher[_t90], (((p) + ".switcher") + "[" + _t90 + "]"), errs);
      }
    }
    }
    if (_t86.emptyText !== undefined) {
    if (typeof _t86.emptyText !== "string") errs.push(((p) + ".emptyText") + ": 期望 string，实收 " + typeof _t86.emptyText);
    }
    if (_t86.emptyHint !== undefined) {
    if (typeof _t86.emptyHint !== "string") errs.push(((p) + ".emptyHint") + ": 期望 string，实收 " + typeof _t86.emptyHint);
    }
    if (_t86.detachable !== undefined) {
    if (!(_t86.detachable === false || _t86.detachable === true)) errs.push(((p) + ".detachable") + ": 期望 false|true");
    }
    if (_t86.detachTooltip !== undefined) {
    if (typeof _t86.detachTooltip !== "string") errs.push(((p) + ".detachTooltip") + ": 期望 string，实收 " + typeof _t86.detachTooltip);
    }
  }
}
function chkPoolStatusBarItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t96 = v as Record<string, unknown>;
    if (typeof _t96.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t96.id);
    if (typeof _t96.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t96.pluginId);
    if (_t96.icon !== undefined) {
    if (typeof _t96.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t96.icon);
    }
    if (typeof _t96.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t96.label);
    if (_t96.title !== undefined) {
    if (typeof _t96.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t96.title);
    }
    if (!(_t96.align === "left" || _t96.align === "right")) errs.push(((p) + ".align") + ": 期望 left|right");
    if (_t96.onClick !== undefined) {
    if (typeof _t96.onClick !== "string") errs.push(((p) + ".onClick") + ": 期望 string，实收 " + typeof _t96.onClick);
    }
    if (_t96.componentRenderPath !== undefined) {
    if (typeof _t96.componentRenderPath !== "string") errs.push(((p) + ".componentRenderPath") + ": 期望 string，实收 " + typeof _t96.componentRenderPath);
    }
    if (_t96.dividerBefore !== undefined) {
    if (!(_t96.dividerBefore === false || _t96.dividerBefore === true)) errs.push(((p) + ".dividerBefore") + ": 期望 false|true");
    }
  }
}
function chkNotifAction(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t103 = v as Record<string, unknown>;
    if (typeof _t103.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t103.label);
    if (_t103.isPrimary !== undefined) {
    if (!(_t103.isPrimary === false || _t103.isPrimary === true)) errs.push(((p) + ".isPrimary") + ": 期望 false|true");
    }
  }
}
function chkNotifItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t101 = v as Record<string, unknown>;
    if (typeof _t101.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t101.id);
    if (typeof _t101.iconClass !== "string") errs.push(((p) + ".iconClass") + ": 期望 string，实收 " + typeof _t101.iconClass);
    if (typeof _t101.message !== "string") errs.push(((p) + ".message") + ": 期望 string，实收 " + typeof _t101.message);
    if (typeof _t101.timeLabel !== "string") errs.push(((p) + ".timeLabel") + ": 期望 string，实收 " + typeof _t101.timeLabel);
    if (_t101.sourceLabel !== undefined) {
    if (typeof _t101.sourceLabel !== "string") errs.push(((p) + ".sourceLabel") + ": 期望 string，实收 " + typeof _t101.sourceLabel);
    }
    if (!Array.isArray(_t101.actions)) errs.push(((p) + ".actions") + ": 期望数组");
    else {
      for (let _t102 = 0; _t102 < _t101.actions.length; _t102++) {
          chkNotifAction(_t101.actions[_t102], (((p) + ".actions") + "[" + _t102 + "]"), errs);
      }
    }
    if (_t101.progress !== undefined) {
    if (!(_t101.progress === false || _t101.progress === true)) errs.push(((p) + ".progress") + ": 期望 false|true");
    }
    if (_t101.percent !== undefined) {
    if (typeof _t101.percent !== "number") errs.push(((p) + ".percent") + ": 期望 number，实收 " + typeof _t101.percent);
    }
  }
}
function chkNotifGroup(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t99 = v as Record<string, unknown>;
    if (typeof _t99.key !== "string") errs.push(((p) + ".key") + ": 期望 string，实收 " + typeof _t99.key);
    if (typeof _t99.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t99.label);
    if (typeof _t99.unread !== "number") errs.push(((p) + ".unread") + ": 期望 number，实收 " + typeof _t99.unread);
    if (!Array.isArray(_t99.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t100 = 0; _t100 < _t99.items.length; _t100++) {
          chkNotifItem(_t99.items[_t100], (((p) + ".items") + "[" + _t100 + "]"), errs);
      }
    }
  }
}
function chkNotifLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t97 = v as Record<string, unknown>;
    if (typeof _t97.unread !== "number") errs.push(((p) + ".unread") + ": 期望 number，实收 " + typeof _t97.unread);
    if (typeof _t97.bellTitle !== "string") errs.push(((p) + ".bellTitle") + ": 期望 string，实收 " + typeof _t97.bellTitle);
    if (typeof _t97.panelTitle !== "string") errs.push(((p) + ".panelTitle") + ": 期望 string，实收 " + typeof _t97.panelTitle);
    if (typeof _t97.clearLabel !== "string") errs.push(((p) + ".clearLabel") + ": 期望 string，实收 " + typeof _t97.clearLabel);
    if (typeof _t97.emptyLabel !== "string") errs.push(((p) + ".emptyLabel") + ": 期望 string，实收 " + typeof _t97.emptyLabel);
    if (typeof _t97.dismissTitle !== "string") errs.push(((p) + ".dismissTitle") + ": 期望 string，实收 " + typeof _t97.dismissTitle);
    if (!Array.isArray(_t97.groups)) errs.push(((p) + ".groups") + ": 期望数组");
    else {
      for (let _t98 = 0; _t98 < _t97.groups.length; _t98++) {
          chkNotifGroup(_t97.groups[_t98], (((p) + ".groups") + "[" + _t98 + "]"), errs);
      }
    }
    if (_t97.autoOpen !== undefined) {
    if (!(_t97.autoOpen === false || _t97.autoOpen === true)) errs.push(((p) + ".autoOpen") + ": 期望 false|true");
    }
  }
}
function chkStatusBarLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t94 = v as Record<string, unknown>;
    if (!Array.isArray(_t94.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t95 = 0; _t95 < _t94.items.length; _t95++) {
          chkPoolStatusBarItem(_t94.items[_t95], (((p) + ".items") + "[" + _t95 + "]"), errs);
      }
    }
    if (_t94.chordLabel !== undefined) {
    if (typeof _t94.chordLabel !== "string") errs.push(((p) + ".chordLabel") + ": 期望 string，实收 " + typeof _t94.chordLabel);
    }
    chkNotifLayout(_t94.notif, ((p) + ".notif"), errs);
  }
}
function chkPoolLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t18 = v as Record<string, unknown>;
    if (_t18.version !== 2) errs.push(((p) + ".version") + ": 期望 2");
    chkTitleBarLayout(_t18.titleBar, ((p) + ".titleBar"), errs);
    if (_t18.iconBar !== undefined) {
    chkIconBarLayout(_t18.iconBar, ((p) + ".iconBar"), errs);
    }
    if (_t18.sidebar !== undefined) {
    chkSidebarLayout(_t18.sidebar, ((p) + ".sidebar"), errs);
    }
    if (_t18.rightSidebar !== undefined) {
    chkRightSidebarLayout(_t18.rightSidebar, ((p) + ".rightSidebar"), errs);
    }
    if (!Array.isArray(_t18.groups)) errs.push(((p) + ".groups") + ": 期望数组");
    else {
      for (let _t73 = 0; _t73 < _t18.groups.length; _t73++) {
          chkPoolGroup(_t18.groups[_t73], (((p) + ".groups") + "[" + _t73 + "]"), errs);
      }
    }
    if (_t18.activeGroupId !== undefined) {
    if (typeof _t18.activeGroupId !== "string") errs.push(((p) + ".activeGroupId") + ": 期望 string，实收 " + typeof _t18.activeGroupId);
    }
    if (_t18.root !== undefined) {
    chkSplitNode(_t18.root, ((p) + ".root"), errs);
    }
    if (_t18.creatableViews !== undefined) {
    if (!Array.isArray(_t18.creatableViews)) errs.push(((p) + ".creatableViews") + ": 期望数组");
    else {
      for (let _t84 = 0; _t84 < _t18.creatableViews.length; _t84++) {
          chkCreatableViewMeta(_t18.creatableViews[_t84], (((p) + ".creatableViews") + "[" + _t84 + "]"), errs);
      }
    }
    }
    if (_t18.panel !== undefined) {
    chkPanelLayout(_t18.panel, ((p) + ".panel"), errs);
    }
    if (_t18.statusBar !== undefined) {
    chkStatusBarLayout(_t18.statusBar, ((p) + ".statusBar"), errs);
    }
  }
}
function chkPoolQuickPickButton(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t108 = v as Record<string, unknown>;
    if (typeof _t108.actionId !== "string") errs.push(((p) + ".actionId") + ": 期望 string，实收 " + typeof _t108.actionId);
    if (typeof _t108.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t108.icon);
    if (_t108.tooltip !== undefined) {
    if (typeof _t108.tooltip !== "string") errs.push(((p) + ".tooltip") + ": 期望 string，实收 " + typeof _t108.tooltip);
    }
  }
}
function chkPoolQuickPickItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t106 = v as Record<string, unknown>;
    if (typeof _t106.key !== "string") errs.push(((p) + ".key") + ": 期望 string，实收 " + typeof _t106.key);
    if (typeof _t106.searchText !== "string") errs.push(((p) + ".searchText") + ": 期望 string，实收 " + typeof _t106.searchText);
    if (_t106.checked !== undefined) {
    if (!(_t106.checked === false || _t106.checked === true)) errs.push(((p) + ".checked") + ": 期望 false|true");
    }
    if (typeof _t106.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t106.label);
    if (_t106.category !== undefined) {
    if (typeof _t106.category !== "string") errs.push(((p) + ".category") + ": 期望 string，实收 " + typeof _t106.category);
    }
    if (_t106.detail !== undefined) {
    if (typeof _t106.detail !== "string") errs.push(((p) + ".detail") + ": 期望 string，实收 " + typeof _t106.detail);
    }
    if (_t106.keybinding !== undefined) {
    if (typeof _t106.keybinding !== "string") errs.push(((p) + ".keybinding") + ": 期望 string，实收 " + typeof _t106.keybinding);
    }
    if (_t106.buttons !== undefined) {
    if (!Array.isArray(_t106.buttons)) errs.push(((p) + ".buttons") + ": 期望数组");
    else {
      for (let _t107 = 0; _t107 < _t106.buttons.length; _t107++) {
          chkPoolQuickPickButton(_t106.buttons[_t107], (((p) + ".buttons") + "[" + _t107 + "]"), errs);
      }
    }
    }
  }
}
function chkPoolQuickPickData(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t104 = v as Record<string, unknown>;
    if (!(_t104.open === false || _t104.open === true)) errs.push(((p) + ".open") + ": 期望 false|true");
    if (typeof _t104.placeholder !== "string") errs.push(((p) + ".placeholder") + ": 期望 string，实收 " + typeof _t104.placeholder);
    if (_t104.prefix !== undefined) {
    if (typeof _t104.prefix !== "string") errs.push(((p) + ".prefix") + ": 期望 string，实收 " + typeof _t104.prefix);
    }
    if (!Array.isArray(_t104.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t105 = 0; _t105 < _t104.items.length; _t105++) {
          chkPoolQuickPickItem(_t104.items[_t105], (((p) + ".items") + "[" + _t105 + "]"), errs);
      }
    }
  }
}
function chkPoolDialogData(v: unknown, p: string, errs: string[]): void {
  const _t109: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t109.push((p) + ": 期望 object");
    else {
      const _t110 = v as Record<string, unknown>;
      if (_t110.open !== false) _t109.push(((p) + ".open") + ": 期望 false");
    }
  const _t111 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).open === false ? 1 : 0)) : 0);
  if (_t109.length > 0) {
  const _t112: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t112.push((p) + ": 期望 object");
    else {
      const _t113 = v as Record<string, unknown>;
      if (_t113.open !== true) _t112.push(((p) + ".open") + ": 期望 true");
      if (typeof _t113.title !== "string") _t112.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t113.title);
      if (typeof _t113.message !== "string") _t112.push(((p) + ".message") + ": 期望 string，实收 " + typeof _t113.message);
      if (_t113.confirmLabel !== undefined) {
      if (typeof _t113.confirmLabel !== "string") _t112.push(((p) + ".confirmLabel") + ": 期望 string，实收 " + typeof _t113.confirmLabel);
      }
      if (_t113.cancelLabel !== undefined) {
      if (typeof _t113.cancelLabel !== "string") _t112.push(((p) + ".cancelLabel") + ": 期望 string，实收 " + typeof _t113.cancelLabel);
      }
      if (!(_t113.isAlert === false || _t113.isAlert === true)) _t112.push(((p) + ".isAlert") + ": 期望 false|true");
      if (_t113.content !== undefined) {
      if (_t113.content === null || typeof _t113.content !== "object" || Array.isArray(_t113.content)) _t112.push(((p) + ".content") + ": 期望 object");
      else {
        const _t114 = _t113.content as Record<string, unknown>;
        if (typeof _t114.pluginId !== "string") _t112.push((((p) + ".content") + ".pluginId") + ": 期望 string，实收 " + typeof _t114.pluginId);
        if (typeof _t114.renderPath !== "string") _t112.push((((p) + ".content") + ".renderPath") + ": 期望 string，实收 " + typeof _t114.renderPath);
        if (_t114.payload !== undefined) {
        }
      }
      }
    }
  const _t115 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).open === true ? 1 : 0) + (((v as Record<string, unknown>).isAlert === false) || ((v as Record<string, unknown>).isAlert === true) ? 1 : 0)) : 0);
  const _t116 = [{ e: _t109, s: _t111 }, { e: _t112, s: _t115 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t116.length > 0) errs.push(..._t116);
  }
}
function chkPoolFloatingPanelButton(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t123 = v as Record<string, unknown>;
    if (typeof _t123.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t123.id);
    if (typeof _t123.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t123.label);
    if (typeof _t123.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t123.icon);
    if (_t123.toggledIcon !== undefined) {
    if (typeof _t123.toggledIcon !== "string") errs.push(((p) + ".toggledIcon") + ": 期望 string，实收 " + typeof _t123.toggledIcon);
    }
    if (_t123.toggledLabel !== undefined) {
    if (typeof _t123.toggledLabel !== "string") errs.push(((p) + ".toggledLabel") + ": 期望 string，实收 " + typeof _t123.toggledLabel);
    }
    if (_t123.expandOnHover !== undefined) {
    if (!(_t123.expandOnHover === false || _t123.expandOnHover === true)) errs.push(((p) + ".expandOnHover") + ": 期望 false|true");
    }
  }
}
function chkPoolFloatingPanelData(v: unknown, p: string, errs: string[]): void {
  const _t117: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t117.push((p) + ": 期望 object");
    else {
      const _t118 = v as Record<string, unknown>;
      if (_t118.open !== false) _t117.push(((p) + ".open") + ": 期望 false");
    }
  const _t119 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).open === false ? 1 : 0)) : 0);
  if (_t117.length > 0) {
  const _t120: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t120.push((p) + ": 期望 object");
    else {
      const _t121 = v as Record<string, unknown>;
      if (_t121.open !== true) _t120.push(((p) + ".open") + ": 期望 true");
      if (typeof _t121.viewId !== "string") _t120.push(((p) + ".viewId") + ": 期望 string，实收 " + typeof _t121.viewId);
      if (typeof _t121.title !== "string") _t120.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t121.title);
      if (typeof _t121.pluginId !== "string") _t120.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t121.pluginId);
      if (typeof _t121.renderPath !== "string") _t120.push(((p) + ".renderPath") + ": 期望 string，实收 " + typeof _t121.renderPath);
      if (!Array.isArray(_t121.actions)) _t120.push(((p) + ".actions") + ": 期望数组");
      else {
        for (let _t122 = 0; _t122 < _t121.actions.length; _t122++) {
            chkPoolFloatingPanelButton(_t121.actions[_t122], (((p) + ".actions") + "[" + _t122 + "]"), _t120);
        }
      }
      if (_t121.refresh !== undefined) {
      if (!(_t121.refresh === false || _t121.refresh === true)) _t120.push(((p) + ".refresh") + ": 期望 false|true");
      }
    }
  const _t124 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).open === true ? 1 : 0) + (((v as Record<string, unknown>).refresh === false) || ((v as Record<string, unknown>).refresh === true) ? 1 : 0)) : 0);
  const _t125 = [{ e: _t117, s: _t119 }, { e: _t120, s: _t124 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t125.length > 0) errs.push(..._t125);
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
export function assertPoolDialogData(v: unknown): string[] {
  const errs: string[] = [];
  chkPoolDialogData(v, "payload", errs);
  return errs;
}
export function assertPoolFloatingPanelData(v: unknown): string[] {
  const errs: string[] = [];
  chkPoolFloatingPanelData(v, "payload", errs);
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
    case "pool:dialog": return assertPoolDialogData(payload);
    case "pool:floating-panel": return assertPoolFloatingPanelData(payload);
    default: return null;
  }
}
