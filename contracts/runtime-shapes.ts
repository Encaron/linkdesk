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
  }
}
function chkAccentChangedPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t6 = v as Record<string, unknown>;
    if (_t6.variables === null || typeof _t6.variables !== "object" || Array.isArray(_t6.variables)) errs.push(((p) + ".variables") + ": 期望 object");
    else {
      const _t7 = _t6.variables as Record<string, unknown>;
      for (const _t8 of Object.keys(_t7)) {
      if (typeof _t7[_t8] !== "string") errs.push((((p) + ".variables") + "[\"" + _t8 + "\"]") + ": 期望 string，实收 " + typeof _t7[_t8]);
      }
    }
  }
}
function chkPluginStateChangedPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t9 = v as Record<string, unknown>;
    if (typeof _t9.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t9.pluginId);
    if (typeof _t9.key !== "string") errs.push(((p) + ".key") + ": 期望 string，实收 " + typeof _t9.key);
  }
}
function chkTabActivatedPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t10 = v as Record<string, unknown>;
    if (typeof _t10.tabId !== "string") errs.push(((p) + ".tabId") + ": 期望 string，实收 " + typeof _t10.tabId);
    if (typeof _t10.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t10.pluginId);
    if (_t10.filePath !== undefined) {
    if (typeof _t10.filePath !== "string") errs.push(((p) + ".filePath") + ": 期望 string，实收 " + typeof _t10.filePath);
    }
  }
}
function chkWorkspaceActiveChangedPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t11 = v as Record<string, unknown>;
    if (typeof _t11.uri !== "string") errs.push(((p) + ".uri") + ": 期望 string，实收 " + typeof _t11.uri);
  }
}
function chkSettingsRequestGroupPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t12 = v as Record<string, unknown>;
    if (typeof _t12.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t12.pluginId);
  }
}
function chkSettingsScrollToPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t13 = v as Record<string, unknown>;
    if (typeof _t13.key !== "string") errs.push(((p) + ".key") + ": 期望 string，实收 " + typeof _t13.key);
  }
}
function chkSerialDataPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t14 = v as Record<string, unknown>;
    if (typeof _t14.portName !== "string") errs.push(((p) + ".portName") + ": 期望 string，实收 " + typeof _t14.portName);
    if (typeof _t14.text !== "string") errs.push(((p) + ".text") + ": 期望 string，实收 " + typeof _t14.text);
  }
}
function chkSerialStatsPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t15 = v as Record<string, unknown>;
    if (typeof _t15.portName !== "string") errs.push(((p) + ".portName") + ": 期望 string，实收 " + typeof _t15.portName);
    if (_t15.tx !== undefined) {
    if (typeof _t15.tx !== "number") errs.push(((p) + ".tx") + ": 期望 number，实收 " + typeof _t15.tx);
    }
    if (_t15.rx !== undefined) {
    if (typeof _t15.rx !== "number") errs.push(((p) + ".rx") + ": 期望 number，实收 " + typeof _t15.rx);
    }
  }
}
function chkSerialSystemPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t16 = v as Record<string, unknown>;
    if (typeof _t16.portName !== "string") errs.push(((p) + ".portName") + ": 期望 string，实收 " + typeof _t16.portName);
    if (typeof _t16.message !== "string") errs.push(((p) + ".message") + ": 期望 string，实收 " + typeof _t16.message);
    if (!(_t16.type === "status" || _t16.type === "error")) errs.push(((p) + ".type") + ": 期望 status|error");
  }
}
function chkPoolMenuItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t22 = v as Record<string, unknown>;
    if (typeof _t22.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t22.label);
    if (typeof _t22.command !== "string") errs.push(((p) + ".command") + ": 期望 string，实收 " + typeof _t22.command);
    if (_t22.shortcut !== undefined) {
    if (typeof _t22.shortcut !== "string") errs.push(((p) + ".shortcut") + ": 期望 string，实收 " + typeof _t22.shortcut);
    }
    if (_t22.children !== undefined) {
    if (!Array.isArray(_t22.children)) errs.push(((p) + ".children") + ": 期望数组");
    else {
      for (let _t23 = 0; _t23 < _t22.children.length; _t23++) {
          chkPoolMenuItem(_t22.children[_t23], (((p) + ".children") + "[" + _t23 + "]"), errs);
      }
    }
    }
  }
}
function chkPoolMenuGroup(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t20 = v as Record<string, unknown>;
    if (typeof _t20.group !== "string") errs.push(((p) + ".group") + ": 期望 string，实收 " + typeof _t20.group);
    if (typeof _t20.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t20.label);
    if (!Array.isArray(_t20.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t21 = 0; _t21 < _t20.items.length; _t21++) {
          chkPoolMenuItem(_t20.items[_t21], (((p) + ".items") + "[" + _t21 + "]"), errs);
      }
    }
  }
}
function chkTitleBarSlotButton(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t26 = v as Record<string, unknown>;
    if (typeof _t26.command !== "string") errs.push(((p) + ".command") + ": 期望 string，实收 " + typeof _t26.command);
    if (_t26.icon !== undefined) {
    if (typeof _t26.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t26.icon);
    }
    if (typeof _t26.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t26.title);
  }
}
function chkTitleBarLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t18 = v as Record<string, unknown>;
    if (typeof _t18.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t18.title);
    if (typeof _t18.logoUrl !== "string") errs.push(((p) + ".logoUrl") + ": 期望 string，实收 " + typeof _t18.logoUrl);
    if (!(_t18.menuBarVisible === false || _t18.menuBarVisible === true)) errs.push(((p) + ".menuBarVisible") + ": 期望 false|true");
    if (!Array.isArray(_t18.menuGroups)) errs.push(((p) + ".menuGroups") + ": 期望数组");
    else {
      for (let _t19 = 0; _t19 < _t18.menuGroups.length; _t19++) {
          chkPoolMenuGroup(_t18.menuGroups[_t19], (((p) + ".menuGroups") + "[" + _t19 + "]"), errs);
      }
    }
    if (_t18.slots === null || typeof _t18.slots !== "object" || Array.isArray(_t18.slots)) errs.push(((p) + ".slots") + ": 期望 object");
    else {
      const _t24 = _t18.slots as Record<string, unknown>;
      if (!Array.isArray(_t24.left)) errs.push((((p) + ".slots") + ".left") + ": 期望数组");
      else {
        for (let _t25 = 0; _t25 < _t24.left.length; _t25++) {
            chkTitleBarSlotButton(_t24.left[_t25], ((((p) + ".slots") + ".left") + "[" + _t25 + "]"), errs);
        }
      }
      if (!Array.isArray(_t24.right)) errs.push((((p) + ".slots") + ".right") + ": 期望数组");
      else {
        for (let _t27 = 0; _t27 < _t24.right.length; _t27++) {
            chkTitleBarSlotButton(_t24.right[_t27], ((((p) + ".slots") + ".right") + "[" + _t27 + "]"), errs);
        }
      }
    }
    if (_t18.windowControls === null || typeof _t18.windowControls !== "object" || Array.isArray(_t18.windowControls)) errs.push(((p) + ".windowControls") + ": 期望 object");
    else {
      const _t28 = _t18.windowControls as Record<string, unknown>;
      if (typeof _t28.minimize !== "string") errs.push((((p) + ".windowControls") + ".minimize") + ": 期望 string，实收 " + typeof _t28.minimize);
      if (typeof _t28.maximize !== "string") errs.push((((p) + ".windowControls") + ".maximize") + ": 期望 string，实收 " + typeof _t28.maximize);
      if (typeof _t28.restore !== "string") errs.push((((p) + ".windowControls") + ".restore") + ": 期望 string，实收 " + typeof _t28.restore);
      if (typeof _t28.close !== "string") errs.push((((p) + ".windowControls") + ".close") + ": 期望 string，实收 " + typeof _t28.close);
      if (typeof _t28.pin !== "string") errs.push((((p) + ".windowControls") + ".pin") + ": 期望 string，实收 " + typeof _t28.pin);
      if (typeof _t28.unpin !== "string") errs.push((((p) + ".windowControls") + ".unpin") + ": 期望 string，实收 " + typeof _t28.unpin);
    }
  }
}
function chkIconBarIcon(v: unknown, p: string, errs: string[]): void {
  const _t32: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t32.push((p) + ": 期望 object");
    else {
      const _t33 = v as Record<string, unknown>;
      if (_t33.kind !== "lucide") _t32.push(((p) + ".kind") + ": 期望 lucide");
      if (typeof _t33.name !== "string") _t32.push(((p) + ".name") + ": 期望 string，实收 " + typeof _t33.name);
    }
  const _t34 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).kind === "lucide" ? 1 : 0)) : 0);
  if (_t32.length > 0) {
  const _t35: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t35.push((p) + ": 期望 object");
    else {
      const _t36 = v as Record<string, unknown>;
      if (_t36.kind !== "codicon") _t35.push(((p) + ".kind") + ": 期望 codicon");
      if (typeof _t36.name !== "string") _t35.push(((p) + ".name") + ": 期望 string，实收 " + typeof _t36.name);
    }
  const _t37 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).kind === "codicon" ? 1 : 0)) : 0);
  if (_t35.length > 0) {
  const _t38: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t38.push((p) + ": 期望 object");
    else {
      const _t39 = v as Record<string, unknown>;
      if (_t39.kind !== "img") _t38.push(((p) + ".kind") + ": 期望 img");
      if (typeof _t39.src !== "string") _t38.push(((p) + ".src") + ": 期望 string，实收 " + typeof _t39.src);
    }
  const _t40 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).kind === "img" ? 1 : 0)) : 0);
  if (_t38.length > 0) {
  const _t41: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t41.push((p) + ": 期望 object");
    else {
      const _t42 = v as Record<string, unknown>;
      if (_t42.kind !== "emoji") _t41.push(((p) + ".kind") + ": 期望 emoji");
      if (typeof _t42.text !== "string") _t41.push(((p) + ".text") + ": 期望 string，实收 " + typeof _t42.text);
    }
  const _t43 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).kind === "emoji" ? 1 : 0)) : 0);
  const _t44 = [{ e: _t32, s: _t34 }, { e: _t35, s: _t37 }, { e: _t38, s: _t40 }, { e: _t41, s: _t43 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t44.length > 0) errs.push(..._t44);
  }
  }
  }
}
function chkIconBarItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t31 = v as Record<string, unknown>;
    if (typeof _t31.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t31.pluginId);
    chkIconBarIcon(_t31.icon, ((p) + ".icon"), errs);
    if (typeof _t31.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t31.label);
    if (!(_t31.location === "top" || _t31.location === "bottom")) errs.push(((p) + ".location") + ": 期望 top|bottom");
  }
}
function chkIconBarLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t29 = v as Record<string, unknown>;
    if (!Array.isArray(_t29.icons)) errs.push(((p) + ".icons") + ": 期望数组");
    else {
      for (let _t30 = 0; _t30 < _t29.icons.length; _t30++) {
          chkIconBarItem(_t29.icons[_t30], (((p) + ".icons") + "[" + _t30 + "]"), errs);
      }
    }
    if (_t29.activePluginId !== undefined) {
    if (typeof _t29.activePluginId !== "string") errs.push(((p) + ".activePluginId") + ": 期望 string，实收 " + typeof _t29.activePluginId);
    }
    if (!(_t29.hamburgerVisible === false || _t29.hamburgerVisible === true)) errs.push(((p) + ".hamburgerVisible") + ": 期望 false|true");
    if (typeof _t29.navLabel !== "string") errs.push(((p) + ".navLabel") + ": 期望 string，实收 " + typeof _t29.navLabel);
    if (_t29.hamburger !== undefined) {
    if (_t29.hamburger === null || typeof _t29.hamburger !== "object" || Array.isArray(_t29.hamburger)) errs.push(((p) + ".hamburger") + ": 期望 object");
    else {
      const _t45 = _t29.hamburger as Record<string, unknown>;
      if (typeof _t45.title !== "string") errs.push((((p) + ".hamburger") + ".title") + ": 期望 string，实收 " + typeof _t45.title);
      if (!Array.isArray(_t45.groups)) errs.push((((p) + ".hamburger") + ".groups") + ": 期望数组");
      else {
        for (let _t46 = 0; _t46 < _t45.groups.length; _t46++) {
            chkPoolMenuGroup(_t45.groups[_t46], ((((p) + ".hamburger") + ".groups") + "[" + _t46 + "]"), errs);
        }
      }
    }
    }
  }
}
function chkTitleActionItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t57 = v as Record<string, unknown>;
    if (typeof _t57.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t57.label);
    if (typeof _t57.command !== "string") errs.push(((p) + ".command") + ": 期望 string，实收 " + typeof _t57.command);
    if (_t57.args !== undefined) {
    }
  }
}
function chkTitleActionWidget(v: unknown, p: string, errs: string[]): void {
  const _t51: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t51.push((p) + ": 期望 object");
    else {
      const _t52 = v as Record<string, unknown>;
      if (_t52.type !== "icon") _t51.push(((p) + ".type") + ": 期望 icon");
      if (typeof _t52.id !== "string") _t51.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t52.id);
      if (typeof _t52.command !== "string") _t51.push(((p) + ".command") + ": 期望 string，实收 " + typeof _t52.command);
      if (typeof _t52.icon !== "string") _t51.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t52.icon);
      if (typeof _t52.title !== "string") _t51.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t52.title);
      if (_t52.args !== undefined) {
      }
    }
  const _t53 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "icon" ? 1 : 0)) : 0);
  if (_t51.length > 0) {
  const _t54: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t54.push((p) + ": 期望 object");
    else {
      const _t55 = v as Record<string, unknown>;
      if (_t55.type !== "dropdown") _t54.push(((p) + ".type") + ": 期望 dropdown");
      if (typeof _t55.id !== "string") _t54.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t55.id);
      if (!Array.isArray(_t55.items)) _t54.push(((p) + ".items") + ": 期望数组");
      else {
        for (let _t56 = 0; _t56 < _t55.items.length; _t56++) {
            chkTitleActionItem(_t55.items[_t56], (((p) + ".items") + "[" + _t56 + "]"), _t54);
        }
      }
      if (_t55.title !== undefined) {
      if (typeof _t55.title !== "string") _t54.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t55.title);
      }
    }
  const _t58 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "dropdown" ? 1 : 0)) : 0);
  if (_t54.length > 0) {
  const _t59: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t59.push((p) + ": 期望 object");
    else {
      const _t60 = v as Record<string, unknown>;
      if (_t60.type !== "split") _t59.push(((p) + ".type") + ": 期望 split");
      if (typeof _t60.id !== "string") _t59.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t60.id);
      if (typeof _t60.command !== "string") _t59.push(((p) + ".command") + ": 期望 string，实收 " + typeof _t60.command);
      if (_t60.icon !== undefined) {
      if (typeof _t60.icon !== "string") _t59.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t60.icon);
      }
      if (typeof _t60.title !== "string") _t59.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t60.title);
      if (!Array.isArray(_t60.items)) _t59.push(((p) + ".items") + ": 期望数组");
      else {
        for (let _t61 = 0; _t61 < _t60.items.length; _t61++) {
            chkTitleActionItem(_t60.items[_t61], (((p) + ".items") + "[" + _t61 + "]"), _t59);
        }
      }
      if (_t60.args !== undefined) {
      }
    }
  const _t62 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "split" ? 1 : 0)) : 0);
  const _t63 = [{ e: _t51, s: _t53 }, { e: _t54, s: _t58 }, { e: _t59, s: _t62 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t63.length > 0) errs.push(..._t63);
  }
  }
}
function chkSidebarViewMeta(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t49 = v as Record<string, unknown>;
    if (typeof _t49.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t49.id);
    if (typeof _t49.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t49.title);
    if (typeof _t49.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t49.pluginId);
    if (typeof _t49.renderPath !== "string") errs.push(((p) + ".renderPath") + ": 期望 string，实收 " + typeof _t49.renderPath);
    if (_t49.role !== undefined) {
    if (!(_t49.role === "toolbar" || _t49.role === "section")) errs.push(((p) + ".role") + ": 期望 toolbar|section");
    }
    if (_t49.order !== undefined) {
    if (typeof _t49.order !== "number") errs.push(((p) + ".order") + ": 期望 number，实收 " + typeof _t49.order);
    }
    if (_t49.collapsed !== undefined) {
    if (!(_t49.collapsed === false || _t49.collapsed === true)) errs.push(((p) + ".collapsed") + ": 期望 false|true");
    }
    if (_t49.badge !== undefined) {
    if (!(typeof _t49.badge === "string" || typeof _t49.badge === "number")) errs.push(((p) + ".badge") + ": 期望 string|number");
    }
    if (_t49.titleDescription !== undefined) {
    if (typeof _t49.titleDescription !== "string") errs.push(((p) + ".titleDescription") + ": 期望 string，实收 " + typeof _t49.titleDescription);
    }
    if (_t49.titleTooltip !== undefined) {
    if (typeof _t49.titleTooltip !== "string") errs.push(((p) + ".titleTooltip") + ": 期望 string，实收 " + typeof _t49.titleTooltip);
    }
    if (_t49.singleViewPaneContainerTitle !== undefined) {
    if (typeof _t49.singleViewPaneContainerTitle !== "string") errs.push(((p) + ".singleViewPaneContainerTitle") + ": 期望 string，实收 " + typeof _t49.singleViewPaneContainerTitle);
    }
    if (_t49.minHeight !== undefined) {
    if (typeof _t49.minHeight !== "number") errs.push(((p) + ".minHeight") + ": 期望 number，实收 " + typeof _t49.minHeight);
    }
    if (_t49.titleActions !== undefined) {
    if (!Array.isArray(_t49.titleActions)) errs.push(((p) + ".titleActions") + ": 期望数组");
    else {
      for (let _t50 = 0; _t50 < _t49.titleActions.length; _t50++) {
          chkTitleActionWidget(_t49.titleActions[_t50], (((p) + ".titleActions") + "[" + _t50 + "]"), errs);
      }
    }
    }
  }
}
function chkSidebarContainerLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t65 = v as Record<string, unknown>;
    if (typeof _t65.containerId !== "string") errs.push(((p) + ".containerId") + ": 期望 string，实收 " + typeof _t65.containerId);
    if (typeof _t65.containerTitle !== "string") errs.push(((p) + ".containerTitle") + ": 期望 string，实收 " + typeof _t65.containerTitle);
    if (_t65.mergeHeaderWhenSingle !== undefined) {
    if (!(_t65.mergeHeaderWhenSingle === false || _t65.mergeHeaderWhenSingle === true)) errs.push(((p) + ".mergeHeaderWhenSingle") + ": 期望 false|true");
    }
    if (!Array.isArray(_t65.views)) errs.push(((p) + ".views") + ": 期望数组");
    else {
      for (let _t66 = 0; _t66 < _t65.views.length; _t66++) {
          chkSidebarViewMeta(_t65.views[_t66], (((p) + ".views") + "[" + _t66 + "]"), errs);
      }
    }
  }
}
function chkSidebarLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t47 = v as Record<string, unknown>;
    if (!(_t47.visible === false || _t47.visible === true)) errs.push(((p) + ".visible") + ": 期望 false|true");
    if (typeof _t47.width !== "number") errs.push(((p) + ".width") + ": 期望 number，实收 " + typeof _t47.width);
    if (_t47.edge !== undefined) {
    if (!(_t47.edge === "left" || _t47.edge === "right")) errs.push(((p) + ".edge") + ": 期望 left|right");
    }
    if (!(_t47.containerId === null || typeof _t47.containerId === "string")) errs.push(((p) + ".containerId") + ": 期望 null|string");
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
    if (_t47.containers !== undefined) {
    if (!Array.isArray(_t47.containers)) errs.push(((p) + ".containers") + ": 期望数组");
    else {
      for (let _t64 = 0; _t64 < _t47.containers.length; _t64++) {
          chkSidebarContainerLayout(_t47.containers[_t64], (((p) + ".containers") + "[" + _t64 + "]"), errs);
      }
    }
    }
    if (_t47.collapsedViews !== undefined) {
    if (!Array.isArray(_t47.collapsedViews)) errs.push(((p) + ".collapsedViews") + ": 期望数组");
    else {
      for (let _t67 = 0; _t67 < _t47.collapsedViews.length; _t67++) {
          if (typeof _t47.collapsedViews[_t67] !== "string") errs.push((((p) + ".collapsedViews") + "[" + _t67 + "]") + ": 期望 string，实收 " + typeof _t47.collapsedViews[_t67]);
      }
    }
    }
    if (_t47.collapsed !== undefined) {
    if (!(_t47.collapsed === false || _t47.collapsed === true)) errs.push(((p) + ".collapsed") + ": 期望 false|true");
    }
    if (_t47.emptyText !== undefined) {
    if (typeof _t47.emptyText !== "string") errs.push(((p) + ".emptyText") + ": 期望 string，实收 " + typeof _t47.emptyText);
    }
    if (_t47.emptyHint !== undefined) {
    if (typeof _t47.emptyHint !== "string") errs.push(((p) + ".emptyHint") + ": 期望 string，实收 " + typeof _t47.emptyHint);
    }
    if (_t47.expandTooltip !== undefined) {
    if (typeof _t47.expandTooltip !== "string") errs.push(((p) + ".expandTooltip") + ": 期望 string，实收 " + typeof _t47.expandTooltip);
    }
    if (_t47.collapseTooltip !== undefined) {
    if (typeof _t47.collapseTooltip !== "string") errs.push(((p) + ".collapseTooltip") + ": 期望 string，实收 " + typeof _t47.collapseTooltip);
    }
    if (_t47.minWidth !== undefined) {
    if (typeof _t47.minWidth !== "number") errs.push(((p) + ".minWidth") + ": 期望 number，实收 " + typeof _t47.minWidth);
    }
    if (_t47.maxWidth !== undefined) {
    if (typeof _t47.maxWidth !== "number") errs.push(((p) + ".maxWidth") + ": 期望 number，实收 " + typeof _t47.maxWidth);
    }
    if (_t47.viewId !== undefined) {
    if (!(_t47.viewId === null || typeof _t47.viewId === "string")) errs.push(((p) + ".viewId") + ": 期望 null|string");
    }
  }
}
function chkRightSidebarLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t68 = v as Record<string, unknown>;
    if (!(_t68.visible === false || _t68.visible === true)) errs.push(((p) + ".visible") + ": 期望 false|true");
    if (typeof _t68.width !== "number") errs.push(((p) + ".width") + ": 期望 number，实收 " + typeof _t68.width);
    if (!(_t68.containerId === null || typeof _t68.containerId === "string")) errs.push(((p) + ".containerId") + ": 期望 null|string");
    if (typeof _t68.containerTitle !== "string") errs.push(((p) + ".containerTitle") + ": 期望 string，实收 " + typeof _t68.containerTitle);
    if (_t68.mergeHeaderWhenSingle !== undefined) {
    if (!(_t68.mergeHeaderWhenSingle === false || _t68.mergeHeaderWhenSingle === true)) errs.push(((p) + ".mergeHeaderWhenSingle") + ": 期望 false|true");
    }
    if (!Array.isArray(_t68.views)) errs.push(((p) + ".views") + ": 期望数组");
    else {
      for (let _t69 = 0; _t69 < _t68.views.length; _t69++) {
          chkSidebarViewMeta(_t68.views[_t69], (((p) + ".views") + "[" + _t69 + "]"), errs);
      }
    }
    if (_t68.containers !== undefined) {
    if (!Array.isArray(_t68.containers)) errs.push(((p) + ".containers") + ": 期望数组");
    else {
      for (let _t70 = 0; _t70 < _t68.containers.length; _t70++) {
          chkSidebarContainerLayout(_t68.containers[_t70], (((p) + ".containers") + "[" + _t70 + "]"), errs);
      }
    }
    }
    if (_t68.collapsedViews !== undefined) {
    if (!Array.isArray(_t68.collapsedViews)) errs.push(((p) + ".collapsedViews") + ": 期望数组");
    else {
      for (let _t71 = 0; _t71 < _t68.collapsedViews.length; _t71++) {
          if (typeof _t68.collapsedViews[_t71] !== "string") errs.push((((p) + ".collapsedViews") + "[" + _t71 + "]") + ": 期望 string，实收 " + typeof _t68.collapsedViews[_t71]);
      }
    }
    }
    if (_t68.collapsed !== undefined) {
    if (!(_t68.collapsed === false || _t68.collapsed === true)) errs.push(((p) + ".collapsed") + ": 期望 false|true");
    }
    if (_t68.minWidth !== undefined) {
    if (typeof _t68.minWidth !== "number") errs.push(((p) + ".minWidth") + ": 期望 number，实收 " + typeof _t68.minWidth);
    }
    if (_t68.maxWidth !== undefined) {
    if (typeof _t68.maxWidth !== "number") errs.push(((p) + ".maxWidth") + ": 期望 number，实收 " + typeof _t68.maxWidth);
    }
    if (_t68.emptyText !== undefined) {
    if (typeof _t68.emptyText !== "string") errs.push(((p) + ".emptyText") + ": 期望 string，实收 " + typeof _t68.emptyText);
    }
    if (_t68.emptyHint !== undefined) {
    if (typeof _t68.emptyHint !== "string") errs.push(((p) + ".emptyHint") + ": 期望 string，实收 " + typeof _t68.emptyHint);
    }
    if (_t68.expandTooltip !== undefined) {
    if (typeof _t68.expandTooltip !== "string") errs.push(((p) + ".expandTooltip") + ": 期望 string，实收 " + typeof _t68.expandTooltip);
    }
    if (_t68.collapseTooltip !== undefined) {
    if (typeof _t68.collapseTooltip !== "string") errs.push(((p) + ".collapseTooltip") + ": 期望 string，实收 " + typeof _t68.collapseTooltip);
    }
  }
}
function chkPoolTab(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t75 = v as Record<string, unknown>;
    if (typeof _t75.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t75.id);
    if (typeof _t75.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t75.pluginId);
    if (typeof _t75.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t75.title);
    if (_t75.sourceId !== undefined) {
    if (typeof _t75.sourceId !== "string") errs.push(((p) + ".sourceId") + ": 期望 string，实收 " + typeof _t75.sourceId);
    }
    if (_t75.dirty !== undefined) {
    if (!(_t75.dirty === false || _t75.dirty === true)) errs.push(((p) + ".dirty") + ": 期望 false|true");
    }
    if (_t75.icon !== undefined) {
    if (typeof _t75.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t75.icon);
    }
    if (_t75.pinned !== undefined) {
    if (!(_t75.pinned === false || _t75.pinned === true)) errs.push(((p) + ".pinned") + ": 期望 false|true");
    }
    if (_t75.closeBehavior !== undefined) {
    if (!(_t75.closeBehavior === "normal" || _t75.closeBehavior === "confirm" || _t75.closeBehavior === "blocked")) errs.push(((p) + ".closeBehavior") + ": 期望 normal|confirm|blocked");
    }
    if (_t75.singleton !== undefined) {
    if (!(_t75.singleton === false || _t75.singleton === true)) errs.push(((p) + ".singleton") + ": 期望 false|true");
    }
    if (_t75.shellRendered !== undefined) {
    if (!(_t75.shellRendered === false || _t75.shellRendered === true)) errs.push(((p) + ".shellRendered") + ": 期望 false|true");
    }
    if (_t75.shellType !== undefined) {
    if (typeof _t75.shellType !== "string") errs.push(((p) + ".shellType") + ": 期望 string，实收 " + typeof _t75.shellType);
    }
    if (_t75.detailPluginId !== undefined) {
    if (typeof _t75.detailPluginId !== "string") errs.push(((p) + ".detailPluginId") + ": 期望 string，实收 " + typeof _t75.detailPluginId);
    }
  }
}
function chkPoolGroup(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t73 = v as Record<string, unknown>;
    if (typeof _t73.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t73.id);
    if (typeof _t73.flex !== "number") errs.push(((p) + ".flex") + ": 期望 number，实收 " + typeof _t73.flex);
    if (typeof _t73.activeTabId !== "string") errs.push(((p) + ".activeTabId") + ": 期望 string，实收 " + typeof _t73.activeTabId);
    if (!Array.isArray(_t73.tabs)) errs.push(((p) + ".tabs") + ": 期望数组");
    else {
      for (let _t74 = 0; _t74 < _t73.tabs.length; _t74++) {
          chkPoolTab(_t73.tabs[_t74], (((p) + ".tabs") + "[" + _t74 + "]"), errs);
      }
    }
  }
}
function chkSplitNode(v: unknown, p: string, errs: string[]): void {
  const _t76: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t76.push((p) + ": 期望 object");
    else {
      const _t77 = v as Record<string, unknown>;
      if (_t77.type !== "leaf") _t76.push(((p) + ".type") + ": 期望 leaf");
      if (typeof _t77.groupId !== "string") _t76.push(((p) + ".groupId") + ": 期望 string，实收 " + typeof _t77.groupId);
    }
  const _t78 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "leaf" ? 1 : 0)) : 0);
  if (_t76.length > 0) {
  const _t79: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t79.push((p) + ": 期望 object");
    else {
      const _t80 = v as Record<string, unknown>;
      if (_t80.type !== "branch") _t79.push(((p) + ".type") + ": 期望 branch");
      if (!(_t80.direction === "horizontal" || _t80.direction === "vertical")) _t79.push(((p) + ".direction") + ": 期望 horizontal|vertical");
      if (!Array.isArray(_t80.children)) _t79.push(((p) + ".children") + ": 期望数组");
      else {
        if (_t80.children.length !== 2) _t79.push(((p) + ".children") + ": 期望长度 2");
          chkSplitNode(_t80.children[0], (((p) + ".children") + "[0]"), _t79);
          chkSplitNode(_t80.children[1], (((p) + ".children") + "[1]"), _t79);
      }
      if (!Array.isArray(_t80.sizes)) _t79.push(((p) + ".sizes") + ": 期望数组");
      else {
        if (_t80.sizes.length !== 2) _t79.push(((p) + ".sizes") + ": 期望长度 2");
          if (typeof _t80.sizes[0] !== "number") _t79.push((((p) + ".sizes") + "[0]") + ": 期望 number，实收 " + typeof _t80.sizes[0]);
          if (typeof _t80.sizes[1] !== "number") _t79.push((((p) + ".sizes") + "[1]") + ": 期望 number，实收 " + typeof _t80.sizes[1]);
      }
    }
  const _t81 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "branch" ? 1 : 0) + (((v as Record<string, unknown>).direction === "horizontal") || ((v as Record<string, unknown>).direction === "vertical") ? 1 : 0)) : 0);
  const _t82 = [{ e: _t76, s: _t78 }, { e: _t79, s: _t81 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t82.length > 0) errs.push(..._t82);
  }
}
function chkCreatableViewMeta(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t84 = v as Record<string, unknown>;
    if (typeof _t84.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t84.pluginId);
    if (typeof _t84.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t84.label);
  }
}
function chkPanelViewMeta(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t87 = v as Record<string, unknown>;
    if (typeof _t87.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t87.id);
    if (typeof _t87.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t87.title);
    if (typeof _t87.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t87.pluginId);
    if (typeof _t87.renderPath !== "string") errs.push(((p) + ".renderPath") + ": 期望 string，实收 " + typeof _t87.renderPath);
    if (_t87.titleActions !== undefined) {
    if (!Array.isArray(_t87.titleActions)) errs.push(((p) + ".titleActions") + ": 期望数组");
    else {
      for (let _t88 = 0; _t88 < _t87.titleActions.length; _t88++) {
          chkTitleActionWidget(_t87.titleActions[_t88], (((p) + ".titleActions") + "[" + _t88 + "]"), errs);
      }
    }
    }
  }
}
function chkPanelSwitcherItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t92 = v as Record<string, unknown>;
    if (typeof _t92.viewId !== "string") errs.push(((p) + ".viewId") + ": 期望 string，实收 " + typeof _t92.viewId);
    if (typeof _t92.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t92.title);
    if (typeof _t92.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t92.pluginId);
    if (!(_t92.visible === false || _t92.visible === true)) errs.push(((p) + ".visible") + ": 期望 false|true");
    if (!(_t92.active === false || _t92.active === true)) errs.push(((p) + ".active") + ": 期望 false|true");
  }
}
function chkPanelSwitcherGroup(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t90 = v as Record<string, unknown>;
    if (typeof _t90.containerId !== "string") errs.push(((p) + ".containerId") + ": 期望 string，实收 " + typeof _t90.containerId);
    if (typeof _t90.containerTitle !== "string") errs.push(((p) + ".containerTitle") + ": 期望 string，实收 " + typeof _t90.containerTitle);
    if (!Array.isArray(_t90.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t91 = 0; _t91 < _t90.items.length; _t91++) {
          chkPanelSwitcherItem(_t90.items[_t91], (((p) + ".items") + "[" + _t91 + "]"), errs);
      }
    }
  }
}
function chkPanelLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t85 = v as Record<string, unknown>;
    if (!(_t85.visible === false || _t85.visible === true)) errs.push(((p) + ".visible") + ": 期望 false|true");
    if (typeof _t85.height !== "number") errs.push(((p) + ".height") + ": 期望 number，实收 " + typeof _t85.height);
    if (_t85.edge !== undefined) {
    if (!(_t85.edge === "top" || _t85.edge === "bottom" || _t85.edge === "left" || _t85.edge === "right")) errs.push(((p) + ".edge") + ": 期望 top|bottom|left|right");
    }
    if (_t85.align !== undefined) {
    if (!(_t85.align === "left" || _t85.align === "right" || _t85.align === "center" || _t85.align === "justify")) errs.push(((p) + ".align") + ": 期望 left|right|center|justify");
    }
    if (_t85.width !== undefined) {
    if (typeof _t85.width !== "number") errs.push(((p) + ".width") + ": 期望 number，实收 " + typeof _t85.width);
    }
    if (typeof _t85.activeViewId !== "string") errs.push(((p) + ".activeViewId") + ": 期望 string，实收 " + typeof _t85.activeViewId);
    if (!Array.isArray(_t85.views)) errs.push(((p) + ".views") + ": 期望数组");
    else {
      for (let _t86 = 0; _t86 < _t85.views.length; _t86++) {
          chkPanelViewMeta(_t85.views[_t86], (((p) + ".views") + "[" + _t86 + "]"), errs);
      }
    }
    if (_t85.minHeight !== undefined) {
    if (typeof _t85.minHeight !== "number") errs.push(((p) + ".minHeight") + ": 期望 number，实收 " + typeof _t85.minHeight);
    }
    if (_t85.maxHeight !== undefined) {
    if (typeof _t85.maxHeight !== "number") errs.push(((p) + ".maxHeight") + ": 期望 number，实收 " + typeof _t85.maxHeight);
    }
    if (_t85.minWidth !== undefined) {
    if (typeof _t85.minWidth !== "number") errs.push(((p) + ".minWidth") + ": 期望 number，实收 " + typeof _t85.minWidth);
    }
    if (_t85.maxWidth !== undefined) {
    if (typeof _t85.maxWidth !== "number") errs.push(((p) + ".maxWidth") + ": 期望 number，实收 " + typeof _t85.maxWidth);
    }
    if (_t85.createTooltip !== undefined) {
    if (typeof _t85.createTooltip !== "string") errs.push(((p) + ".createTooltip") + ": 期望 string，实收 " + typeof _t85.createTooltip);
    }
    if (_t85.switcher !== undefined) {
    if (!Array.isArray(_t85.switcher)) errs.push(((p) + ".switcher") + ": 期望数组");
    else {
      for (let _t89 = 0; _t89 < _t85.switcher.length; _t89++) {
          chkPanelSwitcherGroup(_t85.switcher[_t89], (((p) + ".switcher") + "[" + _t89 + "]"), errs);
      }
    }
    }
    if (_t85.emptyText !== undefined) {
    if (typeof _t85.emptyText !== "string") errs.push(((p) + ".emptyText") + ": 期望 string，实收 " + typeof _t85.emptyText);
    }
    if (_t85.emptyHint !== undefined) {
    if (typeof _t85.emptyHint !== "string") errs.push(((p) + ".emptyHint") + ": 期望 string，实收 " + typeof _t85.emptyHint);
    }
    if (_t85.detachable !== undefined) {
    if (!(_t85.detachable === false || _t85.detachable === true)) errs.push(((p) + ".detachable") + ": 期望 false|true");
    }
    if (_t85.detachTooltip !== undefined) {
    if (typeof _t85.detachTooltip !== "string") errs.push(((p) + ".detachTooltip") + ": 期望 string，实收 " + typeof _t85.detachTooltip);
    }
  }
}
function chkPoolStatusBarItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t95 = v as Record<string, unknown>;
    if (typeof _t95.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t95.id);
    if (typeof _t95.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t95.pluginId);
    if (_t95.icon !== undefined) {
    if (typeof _t95.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t95.icon);
    }
    if (typeof _t95.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t95.label);
    if (_t95.title !== undefined) {
    if (typeof _t95.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t95.title);
    }
    if (!(_t95.align === "left" || _t95.align === "right")) errs.push(((p) + ".align") + ": 期望 left|right");
    if (_t95.onClick !== undefined) {
    if (typeof _t95.onClick !== "string") errs.push(((p) + ".onClick") + ": 期望 string，实收 " + typeof _t95.onClick);
    }
    if (_t95.component !== undefined) {
    if (!(_t95.component === false || _t95.component === true)) errs.push(((p) + ".component") + ": 期望 false|true");
    }
    if (_t95.dividerBefore !== undefined) {
    if (!(_t95.dividerBefore === false || _t95.dividerBefore === true)) errs.push(((p) + ".dividerBefore") + ": 期望 false|true");
    }
  }
}
function chkNotifAction(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t102 = v as Record<string, unknown>;
    if (typeof _t102.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t102.label);
    if (_t102.isPrimary !== undefined) {
    if (!(_t102.isPrimary === false || _t102.isPrimary === true)) errs.push(((p) + ".isPrimary") + ": 期望 false|true");
    }
  }
}
function chkNotifItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t100 = v as Record<string, unknown>;
    if (typeof _t100.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t100.id);
    if (typeof _t100.iconClass !== "string") errs.push(((p) + ".iconClass") + ": 期望 string，实收 " + typeof _t100.iconClass);
    if (typeof _t100.message !== "string") errs.push(((p) + ".message") + ": 期望 string，实收 " + typeof _t100.message);
    if (typeof _t100.timeLabel !== "string") errs.push(((p) + ".timeLabel") + ": 期望 string，实收 " + typeof _t100.timeLabel);
    if (_t100.sourceLabel !== undefined) {
    if (typeof _t100.sourceLabel !== "string") errs.push(((p) + ".sourceLabel") + ": 期望 string，实收 " + typeof _t100.sourceLabel);
    }
    if (!Array.isArray(_t100.actions)) errs.push(((p) + ".actions") + ": 期望数组");
    else {
      for (let _t101 = 0; _t101 < _t100.actions.length; _t101++) {
          chkNotifAction(_t100.actions[_t101], (((p) + ".actions") + "[" + _t101 + "]"), errs);
      }
    }
  }
}
function chkNotifGroup(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t98 = v as Record<string, unknown>;
    if (typeof _t98.key !== "string") errs.push(((p) + ".key") + ": 期望 string，实收 " + typeof _t98.key);
    if (typeof _t98.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t98.label);
    if (typeof _t98.unread !== "number") errs.push(((p) + ".unread") + ": 期望 number，实收 " + typeof _t98.unread);
    if (!Array.isArray(_t98.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t99 = 0; _t99 < _t98.items.length; _t99++) {
          chkNotifItem(_t98.items[_t99], (((p) + ".items") + "[" + _t99 + "]"), errs);
      }
    }
  }
}
function chkNotifLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t96 = v as Record<string, unknown>;
    if (typeof _t96.unread !== "number") errs.push(((p) + ".unread") + ": 期望 number，实收 " + typeof _t96.unread);
    if (typeof _t96.bellTitle !== "string") errs.push(((p) + ".bellTitle") + ": 期望 string，实收 " + typeof _t96.bellTitle);
    if (typeof _t96.panelTitle !== "string") errs.push(((p) + ".panelTitle") + ": 期望 string，实收 " + typeof _t96.panelTitle);
    if (typeof _t96.clearLabel !== "string") errs.push(((p) + ".clearLabel") + ": 期望 string，实收 " + typeof _t96.clearLabel);
    if (typeof _t96.emptyLabel !== "string") errs.push(((p) + ".emptyLabel") + ": 期望 string，实收 " + typeof _t96.emptyLabel);
    if (typeof _t96.dismissTitle !== "string") errs.push(((p) + ".dismissTitle") + ": 期望 string，实收 " + typeof _t96.dismissTitle);
    if (!Array.isArray(_t96.groups)) errs.push(((p) + ".groups") + ": 期望数组");
    else {
      for (let _t97 = 0; _t97 < _t96.groups.length; _t97++) {
          chkNotifGroup(_t96.groups[_t97], (((p) + ".groups") + "[" + _t97 + "]"), errs);
      }
    }
  }
}
function chkStatusBarLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t93 = v as Record<string, unknown>;
    if (!Array.isArray(_t93.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t94 = 0; _t94 < _t93.items.length; _t94++) {
          chkPoolStatusBarItem(_t93.items[_t94], (((p) + ".items") + "[" + _t94 + "]"), errs);
      }
    }
    if (_t93.chordLabel !== undefined) {
    if (typeof _t93.chordLabel !== "string") errs.push(((p) + ".chordLabel") + ": 期望 string，实收 " + typeof _t93.chordLabel);
    }
    chkNotifLayout(_t93.notif, ((p) + ".notif"), errs);
  }
}
function chkPoolLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t17 = v as Record<string, unknown>;
    if (_t17.version !== 2) errs.push(((p) + ".version") + ": 期望 2");
    chkTitleBarLayout(_t17.titleBar, ((p) + ".titleBar"), errs);
    if (_t17.iconBar !== undefined) {
    chkIconBarLayout(_t17.iconBar, ((p) + ".iconBar"), errs);
    }
    if (_t17.sidebar !== undefined) {
    chkSidebarLayout(_t17.sidebar, ((p) + ".sidebar"), errs);
    }
    if (_t17.rightSidebar !== undefined) {
    chkRightSidebarLayout(_t17.rightSidebar, ((p) + ".rightSidebar"), errs);
    }
    if (!Array.isArray(_t17.groups)) errs.push(((p) + ".groups") + ": 期望数组");
    else {
      for (let _t72 = 0; _t72 < _t17.groups.length; _t72++) {
          chkPoolGroup(_t17.groups[_t72], (((p) + ".groups") + "[" + _t72 + "]"), errs);
      }
    }
    if (_t17.activeGroupId !== undefined) {
    if (typeof _t17.activeGroupId !== "string") errs.push(((p) + ".activeGroupId") + ": 期望 string，实收 " + typeof _t17.activeGroupId);
    }
    if (_t17.root !== undefined) {
    chkSplitNode(_t17.root, ((p) + ".root"), errs);
    }
    if (_t17.creatableViews !== undefined) {
    if (!Array.isArray(_t17.creatableViews)) errs.push(((p) + ".creatableViews") + ": 期望数组");
    else {
      for (let _t83 = 0; _t83 < _t17.creatableViews.length; _t83++) {
          chkCreatableViewMeta(_t17.creatableViews[_t83], (((p) + ".creatableViews") + "[" + _t83 + "]"), errs);
      }
    }
    }
    if (_t17.panel !== undefined) {
    chkPanelLayout(_t17.panel, ((p) + ".panel"), errs);
    }
    if (_t17.statusBar !== undefined) {
    chkStatusBarLayout(_t17.statusBar, ((p) + ".statusBar"), errs);
    }
  }
}
function chkPoolQuickPickButton(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t107 = v as Record<string, unknown>;
    if (typeof _t107.actionId !== "string") errs.push(((p) + ".actionId") + ": 期望 string，实收 " + typeof _t107.actionId);
    if (typeof _t107.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t107.icon);
    if (_t107.tooltip !== undefined) {
    if (typeof _t107.tooltip !== "string") errs.push(((p) + ".tooltip") + ": 期望 string，实收 " + typeof _t107.tooltip);
    }
  }
}
function chkPoolQuickPickItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t105 = v as Record<string, unknown>;
    if (typeof _t105.key !== "string") errs.push(((p) + ".key") + ": 期望 string，实收 " + typeof _t105.key);
    if (typeof _t105.searchText !== "string") errs.push(((p) + ".searchText") + ": 期望 string，实收 " + typeof _t105.searchText);
    if (_t105.checked !== undefined) {
    if (!(_t105.checked === false || _t105.checked === true)) errs.push(((p) + ".checked") + ": 期望 false|true");
    }
    if (typeof _t105.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t105.label);
    if (_t105.category !== undefined) {
    if (typeof _t105.category !== "string") errs.push(((p) + ".category") + ": 期望 string，实收 " + typeof _t105.category);
    }
    if (_t105.detail !== undefined) {
    if (typeof _t105.detail !== "string") errs.push(((p) + ".detail") + ": 期望 string，实收 " + typeof _t105.detail);
    }
    if (_t105.keybinding !== undefined) {
    if (typeof _t105.keybinding !== "string") errs.push(((p) + ".keybinding") + ": 期望 string，实收 " + typeof _t105.keybinding);
    }
    if (_t105.buttons !== undefined) {
    if (!Array.isArray(_t105.buttons)) errs.push(((p) + ".buttons") + ": 期望数组");
    else {
      for (let _t106 = 0; _t106 < _t105.buttons.length; _t106++) {
          chkPoolQuickPickButton(_t105.buttons[_t106], (((p) + ".buttons") + "[" + _t106 + "]"), errs);
      }
    }
    }
  }
}
function chkPoolQuickPickData(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t103 = v as Record<string, unknown>;
    if (!(_t103.open === false || _t103.open === true)) errs.push(((p) + ".open") + ": 期望 false|true");
    if (typeof _t103.placeholder !== "string") errs.push(((p) + ".placeholder") + ": 期望 string，实收 " + typeof _t103.placeholder);
    if (_t103.prefix !== undefined) {
    if (typeof _t103.prefix !== "string") errs.push(((p) + ".prefix") + ": 期望 string，实收 " + typeof _t103.prefix);
    }
    if (!Array.isArray(_t103.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t104 = 0; _t104 < _t103.items.length; _t104++) {
          chkPoolQuickPickItem(_t103.items[_t104], (((p) + ".items") + "[" + _t104 + "]"), errs);
      }
    }
  }
}
function chkPoolToastButton(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t112 = v as Record<string, unknown>;
    if (typeof _t112.actionId !== "string") errs.push(((p) + ".actionId") + ": 期望 string，实收 " + typeof _t112.actionId);
    if (typeof _t112.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t112.label);
    if (_t112.isPrimary !== undefined) {
    if (!(_t112.isPrimary === false || _t112.isPrimary === true)) errs.push(((p) + ".isPrimary") + ": 期望 false|true");
    }
  }
}
function chkPoolToastItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t110 = v as Record<string, unknown>;
    if (typeof _t110.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t110.id);
    if (typeof _t110.message !== "string") errs.push(((p) + ".message") + ": 期望 string，实收 " + typeof _t110.message);
    if (typeof _t110.iconClass !== "string") errs.push(((p) + ".iconClass") + ": 期望 string，实收 " + typeof _t110.iconClass);
    if (_t110.sourceText !== undefined) {
    if (typeof _t110.sourceText !== "string") errs.push(((p) + ".sourceText") + ": 期望 string，实收 " + typeof _t110.sourceText);
    }
    if (_t110.actions !== undefined) {
    if (!Array.isArray(_t110.actions)) errs.push(((p) + ".actions") + ": 期望数组");
    else {
      for (let _t111 = 0; _t111 < _t110.actions.length; _t111++) {
          chkPoolToastButton(_t110.actions[_t111], (((p) + ".actions") + "[" + _t111 + "]"), errs);
      }
    }
    }
  }
}
function chkPoolToastData(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t108 = v as Record<string, unknown>;
    if (!Array.isArray(_t108.toasts)) errs.push(((p) + ".toasts") + ": 期望数组");
    else {
      for (let _t109 = 0; _t109 < _t108.toasts.length; _t109++) {
          chkPoolToastItem(_t108.toasts[_t109], (((p) + ".toasts") + "[" + _t109 + "]"), errs);
      }
    }
    if (!(_t108.suppressed === false || _t108.suppressed === true)) errs.push(((p) + ".suppressed") + ": 期望 false|true");
  }
}
function chkPoolDialogData(v: unknown, p: string, errs: string[]): void {
  const _t113: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t113.push((p) + ": 期望 object");
    else {
      const _t114 = v as Record<string, unknown>;
      if (_t114.open !== false) _t113.push(((p) + ".open") + ": 期望 false");
    }
  const _t115 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).open === false ? 1 : 0)) : 0);
  if (_t113.length > 0) {
  const _t116: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t116.push((p) + ": 期望 object");
    else {
      const _t117 = v as Record<string, unknown>;
      if (_t117.open !== true) _t116.push(((p) + ".open") + ": 期望 true");
      if (typeof _t117.title !== "string") _t116.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t117.title);
      if (typeof _t117.message !== "string") _t116.push(((p) + ".message") + ": 期望 string，实收 " + typeof _t117.message);
      if (_t117.confirmLabel !== undefined) {
      if (typeof _t117.confirmLabel !== "string") _t116.push(((p) + ".confirmLabel") + ": 期望 string，实收 " + typeof _t117.confirmLabel);
      }
      if (_t117.cancelLabel !== undefined) {
      if (typeof _t117.cancelLabel !== "string") _t116.push(((p) + ".cancelLabel") + ": 期望 string，实收 " + typeof _t117.cancelLabel);
      }
      if (!(_t117.isAlert === false || _t117.isAlert === true)) _t116.push(((p) + ".isAlert") + ": 期望 false|true");
    }
  const _t118 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).open === true ? 1 : 0) + (((v as Record<string, unknown>).isAlert === false) || ((v as Record<string, unknown>).isAlert === true) ? 1 : 0)) : 0);
  const _t119 = [{ e: _t113, s: _t115 }, { e: _t116, s: _t118 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t119.length > 0) errs.push(..._t119);
  }
}
function chkPoolFloatingPanelButton(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t126 = v as Record<string, unknown>;
    if (typeof _t126.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t126.id);
    if (typeof _t126.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t126.label);
    if (typeof _t126.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t126.icon);
    if (_t126.toggledIcon !== undefined) {
    if (typeof _t126.toggledIcon !== "string") errs.push(((p) + ".toggledIcon") + ": 期望 string，实收 " + typeof _t126.toggledIcon);
    }
    if (_t126.toggledLabel !== undefined) {
    if (typeof _t126.toggledLabel !== "string") errs.push(((p) + ".toggledLabel") + ": 期望 string，实收 " + typeof _t126.toggledLabel);
    }
    if (_t126.expandOnHover !== undefined) {
    if (!(_t126.expandOnHover === false || _t126.expandOnHover === true)) errs.push(((p) + ".expandOnHover") + ": 期望 false|true");
    }
  }
}
function chkPoolFloatingPanelData(v: unknown, p: string, errs: string[]): void {
  const _t120: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t120.push((p) + ": 期望 object");
    else {
      const _t121 = v as Record<string, unknown>;
      if (_t121.open !== false) _t120.push(((p) + ".open") + ": 期望 false");
    }
  const _t122 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).open === false ? 1 : 0)) : 0);
  if (_t120.length > 0) {
  const _t123: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t123.push((p) + ": 期望 object");
    else {
      const _t124 = v as Record<string, unknown>;
      if (_t124.open !== true) _t123.push(((p) + ".open") + ": 期望 true");
      if (typeof _t124.viewId !== "string") _t123.push(((p) + ".viewId") + ": 期望 string，实收 " + typeof _t124.viewId);
      if (typeof _t124.title !== "string") _t123.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t124.title);
      if (typeof _t124.pluginId !== "string") _t123.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t124.pluginId);
      if (typeof _t124.renderPath !== "string") _t123.push(((p) + ".renderPath") + ": 期望 string，实收 " + typeof _t124.renderPath);
      if (!Array.isArray(_t124.actions)) _t123.push(((p) + ".actions") + ": 期望数组");
      else {
        for (let _t125 = 0; _t125 < _t124.actions.length; _t125++) {
            chkPoolFloatingPanelButton(_t124.actions[_t125], (((p) + ".actions") + "[" + _t125 + "]"), _t123);
        }
      }
      if (_t124.refresh !== undefined) {
      if (!(_t124.refresh === false || _t124.refresh === true)) _t123.push(((p) + ".refresh") + ": 期望 false|true");
      }
    }
  const _t127 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).open === true ? 1 : 0) + (((v as Record<string, unknown>).refresh === false) || ((v as Record<string, unknown>).refresh === true) ? 1 : 0)) : 0);
  const _t128 = [{ e: _t120, s: _t122 }, { e: _t123, s: _t127 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t128.length > 0) errs.push(..._t128);
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
    case "pool:toast": return assertPoolToastData(payload);
    case "pool:dialog": return assertPoolDialogData(payload);
    case "pool:floating-panel": return assertPoolFloatingPanelData(payload);
    default: return null;
  }
}
