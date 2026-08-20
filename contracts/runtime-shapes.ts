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
function chkTitleActionItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t55 = v as Record<string, unknown>;
    if (typeof _t55.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t55.label);
    if (typeof _t55.command !== "string") errs.push(((p) + ".command") + ": 期望 string，实收 " + typeof _t55.command);
    if (_t55.args !== undefined) {
    }
  }
}
function chkTitleActionWidget(v: unknown, p: string, errs: string[]): void {
  const _t49: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t49.push((p) + ": 期望 object");
    else {
      const _t50 = v as Record<string, unknown>;
      if (_t50.type !== "icon") _t49.push(((p) + ".type") + ": 期望 icon");
      if (typeof _t50.id !== "string") _t49.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t50.id);
      if (typeof _t50.command !== "string") _t49.push(((p) + ".command") + ": 期望 string，实收 " + typeof _t50.command);
      if (typeof _t50.icon !== "string") _t49.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t50.icon);
      if (typeof _t50.title !== "string") _t49.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t50.title);
      if (_t50.args !== undefined) {
      }
    }
  const _t51 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "icon" ? 1 : 0)) : 0);
  if (_t49.length > 0) {
  const _t52: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t52.push((p) + ": 期望 object");
    else {
      const _t53 = v as Record<string, unknown>;
      if (_t53.type !== "dropdown") _t52.push(((p) + ".type") + ": 期望 dropdown");
      if (typeof _t53.id !== "string") _t52.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t53.id);
      if (!Array.isArray(_t53.items)) _t52.push(((p) + ".items") + ": 期望数组");
      else {
        for (let _t54 = 0; _t54 < _t53.items.length; _t54++) {
            chkTitleActionItem(_t53.items[_t54], (((p) + ".items") + "[" + _t54 + "]"), _t52);
        }
      }
      if (_t53.title !== undefined) {
      if (typeof _t53.title !== "string") _t52.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t53.title);
      }
    }
  const _t56 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "dropdown" ? 1 : 0)) : 0);
  if (_t52.length > 0) {
  const _t57: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t57.push((p) + ": 期望 object");
    else {
      const _t58 = v as Record<string, unknown>;
      if (_t58.type !== "split") _t57.push(((p) + ".type") + ": 期望 split");
      if (typeof _t58.id !== "string") _t57.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t58.id);
      if (typeof _t58.command !== "string") _t57.push(((p) + ".command") + ": 期望 string，实收 " + typeof _t58.command);
      if (_t58.icon !== undefined) {
      if (typeof _t58.icon !== "string") _t57.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t58.icon);
      }
      if (typeof _t58.title !== "string") _t57.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t58.title);
      if (!Array.isArray(_t58.items)) _t57.push(((p) + ".items") + ": 期望数组");
      else {
        for (let _t59 = 0; _t59 < _t58.items.length; _t59++) {
            chkTitleActionItem(_t58.items[_t59], (((p) + ".items") + "[" + _t59 + "]"), _t57);
        }
      }
      if (_t58.args !== undefined) {
      }
    }
  const _t60 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "split" ? 1 : 0)) : 0);
  const _t61 = [{ e: _t49, s: _t51 }, { e: _t52, s: _t56 }, { e: _t57, s: _t60 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t61.length > 0) errs.push(..._t61);
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
    if (_t47.titleActions !== undefined) {
    if (!Array.isArray(_t47.titleActions)) errs.push(((p) + ".titleActions") + ": 期望数组");
    else {
      for (let _t48 = 0; _t48 < _t47.titleActions.length; _t48++) {
          chkTitleActionWidget(_t47.titleActions[_t48], (((p) + ".titleActions") + "[" + _t48 + "]"), errs);
      }
    }
    }
  }
}
function chkSidebarContainerLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t63 = v as Record<string, unknown>;
    if (typeof _t63.containerId !== "string") errs.push(((p) + ".containerId") + ": 期望 string，实收 " + typeof _t63.containerId);
    if (typeof _t63.containerTitle !== "string") errs.push(((p) + ".containerTitle") + ": 期望 string，实收 " + typeof _t63.containerTitle);
    if (_t63.mergeHeaderWhenSingle !== undefined) {
    if (!(_t63.mergeHeaderWhenSingle === false || _t63.mergeHeaderWhenSingle === true)) errs.push(((p) + ".mergeHeaderWhenSingle") + ": 期望 false|true");
    }
    if (!Array.isArray(_t63.views)) errs.push(((p) + ".views") + ": 期望数组");
    else {
      for (let _t64 = 0; _t64 < _t63.views.length; _t64++) {
          chkSidebarViewMeta(_t63.views[_t64], (((p) + ".views") + "[" + _t64 + "]"), errs);
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
      for (let _t62 = 0; _t62 < _t45.containers.length; _t62++) {
          chkSidebarContainerLayout(_t45.containers[_t62], (((p) + ".containers") + "[" + _t62 + "]"), errs);
      }
    }
    }
    if (_t45.collapsedViews !== undefined) {
    if (!Array.isArray(_t45.collapsedViews)) errs.push(((p) + ".collapsedViews") + ": 期望数组");
    else {
      for (let _t65 = 0; _t65 < _t45.collapsedViews.length; _t65++) {
          if (typeof _t45.collapsedViews[_t65] !== "string") errs.push((((p) + ".collapsedViews") + "[" + _t65 + "]") + ": 期望 string，实收 " + typeof _t45.collapsedViews[_t65]);
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
    const _t69 = v as Record<string, unknown>;
    if (typeof _t69.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t69.id);
    if (typeof _t69.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t69.pluginId);
    if (typeof _t69.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t69.title);
    if (_t69.sourceId !== undefined) {
    if (typeof _t69.sourceId !== "string") errs.push(((p) + ".sourceId") + ": 期望 string，实收 " + typeof _t69.sourceId);
    }
    if (_t69.dirty !== undefined) {
    if (!(_t69.dirty === false || _t69.dirty === true)) errs.push(((p) + ".dirty") + ": 期望 false|true");
    }
    if (_t69.icon !== undefined) {
    if (typeof _t69.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t69.icon);
    }
    if (_t69.pinned !== undefined) {
    if (!(_t69.pinned === false || _t69.pinned === true)) errs.push(((p) + ".pinned") + ": 期望 false|true");
    }
    if (_t69.closeBehavior !== undefined) {
    if (!(_t69.closeBehavior === "normal" || _t69.closeBehavior === "confirm" || _t69.closeBehavior === "blocked")) errs.push(((p) + ".closeBehavior") + ": 期望 normal|confirm|blocked");
    }
    if (_t69.singleton !== undefined) {
    if (!(_t69.singleton === false || _t69.singleton === true)) errs.push(((p) + ".singleton") + ": 期望 false|true");
    }
    if (_t69.shellRendered !== undefined) {
    if (!(_t69.shellRendered === false || _t69.shellRendered === true)) errs.push(((p) + ".shellRendered") + ": 期望 false|true");
    }
    if (_t69.shellType !== undefined) {
    if (typeof _t69.shellType !== "string") errs.push(((p) + ".shellType") + ": 期望 string，实收 " + typeof _t69.shellType);
    }
    if (_t69.detailPluginId !== undefined) {
    if (typeof _t69.detailPluginId !== "string") errs.push(((p) + ".detailPluginId") + ": 期望 string，实收 " + typeof _t69.detailPluginId);
    }
  }
}
function chkPoolGroup(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t67 = v as Record<string, unknown>;
    if (typeof _t67.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t67.id);
    if (typeof _t67.flex !== "number") errs.push(((p) + ".flex") + ": 期望 number，实收 " + typeof _t67.flex);
    if (typeof _t67.activeTabId !== "string") errs.push(((p) + ".activeTabId") + ": 期望 string，实收 " + typeof _t67.activeTabId);
    if (!Array.isArray(_t67.tabs)) errs.push(((p) + ".tabs") + ": 期望数组");
    else {
      for (let _t68 = 0; _t68 < _t67.tabs.length; _t68++) {
          chkPoolTab(_t67.tabs[_t68], (((p) + ".tabs") + "[" + _t68 + "]"), errs);
      }
    }
  }
}
function chkSplitNode(v: unknown, p: string, errs: string[]): void {
  const _t70: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t70.push((p) + ": 期望 object");
    else {
      const _t71 = v as Record<string, unknown>;
      if (_t71.type !== "leaf") _t70.push(((p) + ".type") + ": 期望 leaf");
      if (typeof _t71.groupId !== "string") _t70.push(((p) + ".groupId") + ": 期望 string，实收 " + typeof _t71.groupId);
    }
  const _t72 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "leaf" ? 1 : 0)) : 0);
  if (_t70.length > 0) {
  const _t73: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t73.push((p) + ": 期望 object");
    else {
      const _t74 = v as Record<string, unknown>;
      if (_t74.type !== "branch") _t73.push(((p) + ".type") + ": 期望 branch");
      if (!(_t74.direction === "horizontal" || _t74.direction === "vertical")) _t73.push(((p) + ".direction") + ": 期望 horizontal|vertical");
      if (!Array.isArray(_t74.children)) _t73.push(((p) + ".children") + ": 期望数组");
      else {
        if (_t74.children.length !== 2) _t73.push(((p) + ".children") + ": 期望长度 2");
          chkSplitNode(_t74.children[0], (((p) + ".children") + "[0]"), _t73);
          chkSplitNode(_t74.children[1], (((p) + ".children") + "[1]"), _t73);
      }
      if (!Array.isArray(_t74.sizes)) _t73.push(((p) + ".sizes") + ": 期望数组");
      else {
        if (_t74.sizes.length !== 2) _t73.push(((p) + ".sizes") + ": 期望长度 2");
          if (typeof _t74.sizes[0] !== "number") _t73.push((((p) + ".sizes") + "[0]") + ": 期望 number，实收 " + typeof _t74.sizes[0]);
          if (typeof _t74.sizes[1] !== "number") _t73.push((((p) + ".sizes") + "[1]") + ": 期望 number，实收 " + typeof _t74.sizes[1]);
      }
    }
  const _t75 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "branch" ? 1 : 0) + (((v as Record<string, unknown>).direction === "horizontal") || ((v as Record<string, unknown>).direction === "vertical") ? 1 : 0)) : 0);
  const _t76 = [{ e: _t70, s: _t72 }, { e: _t73, s: _t75 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t76.length > 0) errs.push(..._t76);
  }
}
function chkCreatableViewMeta(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t78 = v as Record<string, unknown>;
    if (typeof _t78.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t78.pluginId);
    if (typeof _t78.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t78.label);
  }
}
function chkPanelViewMeta(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t81 = v as Record<string, unknown>;
    if (typeof _t81.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t81.id);
    if (typeof _t81.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t81.title);
    if (typeof _t81.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t81.pluginId);
    if (typeof _t81.renderPath !== "string") errs.push(((p) + ".renderPath") + ": 期望 string，实收 " + typeof _t81.renderPath);
    if (_t81.titleActions !== undefined) {
    if (!Array.isArray(_t81.titleActions)) errs.push(((p) + ".titleActions") + ": 期望数组");
    else {
      for (let _t82 = 0; _t82 < _t81.titleActions.length; _t82++) {
          chkTitleActionWidget(_t81.titleActions[_t82], (((p) + ".titleActions") + "[" + _t82 + "]"), errs);
      }
    }
    }
  }
}
function chkPanelSwitcherItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t86 = v as Record<string, unknown>;
    if (typeof _t86.viewId !== "string") errs.push(((p) + ".viewId") + ": 期望 string，实收 " + typeof _t86.viewId);
    if (typeof _t86.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t86.title);
    if (typeof _t86.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t86.pluginId);
    if (!(_t86.visible === false || _t86.visible === true)) errs.push(((p) + ".visible") + ": 期望 false|true");
    if (!(_t86.active === false || _t86.active === true)) errs.push(((p) + ".active") + ": 期望 false|true");
  }
}
function chkPanelSwitcherGroup(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t84 = v as Record<string, unknown>;
    if (typeof _t84.containerId !== "string") errs.push(((p) + ".containerId") + ": 期望 string，实收 " + typeof _t84.containerId);
    if (typeof _t84.containerTitle !== "string") errs.push(((p) + ".containerTitle") + ": 期望 string，实收 " + typeof _t84.containerTitle);
    if (!Array.isArray(_t84.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t85 = 0; _t85 < _t84.items.length; _t85++) {
          chkPanelSwitcherItem(_t84.items[_t85], (((p) + ".items") + "[" + _t85 + "]"), errs);
      }
    }
  }
}
function chkPanelLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t79 = v as Record<string, unknown>;
    if (!(_t79.visible === false || _t79.visible === true)) errs.push(((p) + ".visible") + ": 期望 false|true");
    if (typeof _t79.height !== "number") errs.push(((p) + ".height") + ": 期望 number，实收 " + typeof _t79.height);
    if (typeof _t79.activeViewId !== "string") errs.push(((p) + ".activeViewId") + ": 期望 string，实收 " + typeof _t79.activeViewId);
    if (!Array.isArray(_t79.views)) errs.push(((p) + ".views") + ": 期望数组");
    else {
      for (let _t80 = 0; _t80 < _t79.views.length; _t80++) {
          chkPanelViewMeta(_t79.views[_t80], (((p) + ".views") + "[" + _t80 + "]"), errs);
      }
    }
    if (_t79.minHeight !== undefined) {
    if (typeof _t79.minHeight !== "number") errs.push(((p) + ".minHeight") + ": 期望 number，实收 " + typeof _t79.minHeight);
    }
    if (_t79.maxHeight !== undefined) {
    if (typeof _t79.maxHeight !== "number") errs.push(((p) + ".maxHeight") + ": 期望 number，实收 " + typeof _t79.maxHeight);
    }
    if (_t79.createTooltip !== undefined) {
    if (typeof _t79.createTooltip !== "string") errs.push(((p) + ".createTooltip") + ": 期望 string，实收 " + typeof _t79.createTooltip);
    }
    if (_t79.switcher !== undefined) {
    if (!Array.isArray(_t79.switcher)) errs.push(((p) + ".switcher") + ": 期望数组");
    else {
      for (let _t83 = 0; _t83 < _t79.switcher.length; _t83++) {
          chkPanelSwitcherGroup(_t79.switcher[_t83], (((p) + ".switcher") + "[" + _t83 + "]"), errs);
      }
    }
    }
    if (_t79.emptyText !== undefined) {
    if (typeof _t79.emptyText !== "string") errs.push(((p) + ".emptyText") + ": 期望 string，实收 " + typeof _t79.emptyText);
    }
    if (_t79.emptyHint !== undefined) {
    if (typeof _t79.emptyHint !== "string") errs.push(((p) + ".emptyHint") + ": 期望 string，实收 " + typeof _t79.emptyHint);
    }
  }
}
function chkPoolStatusBarItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t89 = v as Record<string, unknown>;
    if (typeof _t89.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t89.id);
    if (typeof _t89.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t89.pluginId);
    if (_t89.icon !== undefined) {
    if (typeof _t89.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t89.icon);
    }
    if (typeof _t89.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t89.label);
    if (_t89.title !== undefined) {
    if (typeof _t89.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t89.title);
    }
    if (!(_t89.align === "left" || _t89.align === "right")) errs.push(((p) + ".align") + ": 期望 left|right");
    if (_t89.onClick !== undefined) {
    if (typeof _t89.onClick !== "string") errs.push(((p) + ".onClick") + ": 期望 string，实收 " + typeof _t89.onClick);
    }
    if (_t89.component !== undefined) {
    if (!(_t89.component === false || _t89.component === true)) errs.push(((p) + ".component") + ": 期望 false|true");
    }
    if (_t89.dividerBefore !== undefined) {
    if (!(_t89.dividerBefore === false || _t89.dividerBefore === true)) errs.push(((p) + ".dividerBefore") + ": 期望 false|true");
    }
  }
}
function chkNotifAction(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t96 = v as Record<string, unknown>;
    if (typeof _t96.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t96.label);
    if (_t96.isPrimary !== undefined) {
    if (!(_t96.isPrimary === false || _t96.isPrimary === true)) errs.push(((p) + ".isPrimary") + ": 期望 false|true");
    }
  }
}
function chkNotifItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t94 = v as Record<string, unknown>;
    if (typeof _t94.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t94.id);
    if (typeof _t94.iconClass !== "string") errs.push(((p) + ".iconClass") + ": 期望 string，实收 " + typeof _t94.iconClass);
    if (typeof _t94.message !== "string") errs.push(((p) + ".message") + ": 期望 string，实收 " + typeof _t94.message);
    if (typeof _t94.timeLabel !== "string") errs.push(((p) + ".timeLabel") + ": 期望 string，实收 " + typeof _t94.timeLabel);
    if (_t94.sourceLabel !== undefined) {
    if (typeof _t94.sourceLabel !== "string") errs.push(((p) + ".sourceLabel") + ": 期望 string，实收 " + typeof _t94.sourceLabel);
    }
    if (!Array.isArray(_t94.actions)) errs.push(((p) + ".actions") + ": 期望数组");
    else {
      for (let _t95 = 0; _t95 < _t94.actions.length; _t95++) {
          chkNotifAction(_t94.actions[_t95], (((p) + ".actions") + "[" + _t95 + "]"), errs);
      }
    }
  }
}
function chkNotifGroup(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t92 = v as Record<string, unknown>;
    if (typeof _t92.key !== "string") errs.push(((p) + ".key") + ": 期望 string，实收 " + typeof _t92.key);
    if (typeof _t92.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t92.label);
    if (typeof _t92.unread !== "number") errs.push(((p) + ".unread") + ": 期望 number，实收 " + typeof _t92.unread);
    if (!Array.isArray(_t92.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t93 = 0; _t93 < _t92.items.length; _t93++) {
          chkNotifItem(_t92.items[_t93], (((p) + ".items") + "[" + _t93 + "]"), errs);
      }
    }
  }
}
function chkNotifLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t90 = v as Record<string, unknown>;
    if (typeof _t90.unread !== "number") errs.push(((p) + ".unread") + ": 期望 number，实收 " + typeof _t90.unread);
    if (typeof _t90.bellTitle !== "string") errs.push(((p) + ".bellTitle") + ": 期望 string，实收 " + typeof _t90.bellTitle);
    if (typeof _t90.panelTitle !== "string") errs.push(((p) + ".panelTitle") + ": 期望 string，实收 " + typeof _t90.panelTitle);
    if (typeof _t90.clearLabel !== "string") errs.push(((p) + ".clearLabel") + ": 期望 string，实收 " + typeof _t90.clearLabel);
    if (typeof _t90.emptyLabel !== "string") errs.push(((p) + ".emptyLabel") + ": 期望 string，实收 " + typeof _t90.emptyLabel);
    if (typeof _t90.dismissTitle !== "string") errs.push(((p) + ".dismissTitle") + ": 期望 string，实收 " + typeof _t90.dismissTitle);
    if (!Array.isArray(_t90.groups)) errs.push(((p) + ".groups") + ": 期望数组");
    else {
      for (let _t91 = 0; _t91 < _t90.groups.length; _t91++) {
          chkNotifGroup(_t90.groups[_t91], (((p) + ".groups") + "[" + _t91 + "]"), errs);
      }
    }
  }
}
function chkStatusBarLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t87 = v as Record<string, unknown>;
    if (!Array.isArray(_t87.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t88 = 0; _t88 < _t87.items.length; _t88++) {
          chkPoolStatusBarItem(_t87.items[_t88], (((p) + ".items") + "[" + _t88 + "]"), errs);
      }
    }
    if (_t87.chordLabel !== undefined) {
    if (typeof _t87.chordLabel !== "string") errs.push(((p) + ".chordLabel") + ": 期望 string，实收 " + typeof _t87.chordLabel);
    }
    chkNotifLayout(_t87.notif, ((p) + ".notif"), errs);
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
      for (let _t66 = 0; _t66 < _t15.groups.length; _t66++) {
          chkPoolGroup(_t15.groups[_t66], (((p) + ".groups") + "[" + _t66 + "]"), errs);
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
      for (let _t77 = 0; _t77 < _t15.creatableViews.length; _t77++) {
          chkCreatableViewMeta(_t15.creatableViews[_t77], (((p) + ".creatableViews") + "[" + _t77 + "]"), errs);
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
    const _t101 = v as Record<string, unknown>;
    if (typeof _t101.actionId !== "string") errs.push(((p) + ".actionId") + ": 期望 string，实收 " + typeof _t101.actionId);
    if (typeof _t101.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t101.icon);
    if (_t101.tooltip !== undefined) {
    if (typeof _t101.tooltip !== "string") errs.push(((p) + ".tooltip") + ": 期望 string，实收 " + typeof _t101.tooltip);
    }
  }
}
function chkPoolQuickPickItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t99 = v as Record<string, unknown>;
    if (typeof _t99.key !== "string") errs.push(((p) + ".key") + ": 期望 string，实收 " + typeof _t99.key);
    if (typeof _t99.searchText !== "string") errs.push(((p) + ".searchText") + ": 期望 string，实收 " + typeof _t99.searchText);
    if (_t99.checked !== undefined) {
    if (!(_t99.checked === false || _t99.checked === true)) errs.push(((p) + ".checked") + ": 期望 false|true");
    }
    if (typeof _t99.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t99.label);
    if (_t99.category !== undefined) {
    if (typeof _t99.category !== "string") errs.push(((p) + ".category") + ": 期望 string，实收 " + typeof _t99.category);
    }
    if (_t99.detail !== undefined) {
    if (typeof _t99.detail !== "string") errs.push(((p) + ".detail") + ": 期望 string，实收 " + typeof _t99.detail);
    }
    if (_t99.keybinding !== undefined) {
    if (typeof _t99.keybinding !== "string") errs.push(((p) + ".keybinding") + ": 期望 string，实收 " + typeof _t99.keybinding);
    }
    if (_t99.buttons !== undefined) {
    if (!Array.isArray(_t99.buttons)) errs.push(((p) + ".buttons") + ": 期望数组");
    else {
      for (let _t100 = 0; _t100 < _t99.buttons.length; _t100++) {
          chkPoolQuickPickButton(_t99.buttons[_t100], (((p) + ".buttons") + "[" + _t100 + "]"), errs);
      }
    }
    }
  }
}
function chkPoolQuickPickData(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t97 = v as Record<string, unknown>;
    if (!(_t97.open === false || _t97.open === true)) errs.push(((p) + ".open") + ": 期望 false|true");
    if (typeof _t97.placeholder !== "string") errs.push(((p) + ".placeholder") + ": 期望 string，实收 " + typeof _t97.placeholder);
    if (_t97.prefix !== undefined) {
    if (typeof _t97.prefix !== "string") errs.push(((p) + ".prefix") + ": 期望 string，实收 " + typeof _t97.prefix);
    }
    if (!Array.isArray(_t97.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t98 = 0; _t98 < _t97.items.length; _t98++) {
          chkPoolQuickPickItem(_t97.items[_t98], (((p) + ".items") + "[" + _t98 + "]"), errs);
      }
    }
  }
}
function chkPoolToastButton(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t106 = v as Record<string, unknown>;
    if (typeof _t106.actionId !== "string") errs.push(((p) + ".actionId") + ": 期望 string，实收 " + typeof _t106.actionId);
    if (typeof _t106.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t106.label);
    if (_t106.isPrimary !== undefined) {
    if (!(_t106.isPrimary === false || _t106.isPrimary === true)) errs.push(((p) + ".isPrimary") + ": 期望 false|true");
    }
  }
}
function chkPoolToastItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t104 = v as Record<string, unknown>;
    if (typeof _t104.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t104.id);
    if (typeof _t104.message !== "string") errs.push(((p) + ".message") + ": 期望 string，实收 " + typeof _t104.message);
    if (typeof _t104.iconClass !== "string") errs.push(((p) + ".iconClass") + ": 期望 string，实收 " + typeof _t104.iconClass);
    if (_t104.sourceText !== undefined) {
    if (typeof _t104.sourceText !== "string") errs.push(((p) + ".sourceText") + ": 期望 string，实收 " + typeof _t104.sourceText);
    }
    if (_t104.actions !== undefined) {
    if (!Array.isArray(_t104.actions)) errs.push(((p) + ".actions") + ": 期望数组");
    else {
      for (let _t105 = 0; _t105 < _t104.actions.length; _t105++) {
          chkPoolToastButton(_t104.actions[_t105], (((p) + ".actions") + "[" + _t105 + "]"), errs);
      }
    }
    }
  }
}
function chkPoolToastData(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t102 = v as Record<string, unknown>;
    if (!Array.isArray(_t102.toasts)) errs.push(((p) + ".toasts") + ": 期望数组");
    else {
      for (let _t103 = 0; _t103 < _t102.toasts.length; _t103++) {
          chkPoolToastItem(_t102.toasts[_t103], (((p) + ".toasts") + "[" + _t103 + "]"), errs);
      }
    }
    if (!(_t102.suppressed === false || _t102.suppressed === true)) errs.push(((p) + ".suppressed") + ": 期望 false|true");
  }
}
function chkPoolDialogData(v: unknown, p: string, errs: string[]): void {
  const _t107: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t107.push((p) + ": 期望 object");
    else {
      const _t108 = v as Record<string, unknown>;
      if (_t108.open !== false) _t107.push(((p) + ".open") + ": 期望 false");
    }
  const _t109 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).open === false ? 1 : 0)) : 0);
  if (_t107.length > 0) {
  const _t110: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t110.push((p) + ": 期望 object");
    else {
      const _t111 = v as Record<string, unknown>;
      if (_t111.open !== true) _t110.push(((p) + ".open") + ": 期望 true");
      if (typeof _t111.title !== "string") _t110.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t111.title);
      if (typeof _t111.message !== "string") _t110.push(((p) + ".message") + ": 期望 string，实收 " + typeof _t111.message);
      if (_t111.confirmLabel !== undefined) {
      if (typeof _t111.confirmLabel !== "string") _t110.push(((p) + ".confirmLabel") + ": 期望 string，实收 " + typeof _t111.confirmLabel);
      }
      if (_t111.cancelLabel !== undefined) {
      if (typeof _t111.cancelLabel !== "string") _t110.push(((p) + ".cancelLabel") + ": 期望 string，实收 " + typeof _t111.cancelLabel);
      }
      if (!(_t111.isAlert === false || _t111.isAlert === true)) _t110.push(((p) + ".isAlert") + ": 期望 false|true");
    }
  const _t112 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).open === true ? 1 : 0) + (((v as Record<string, unknown>).isAlert === false) || ((v as Record<string, unknown>).isAlert === true) ? 1 : 0)) : 0);
  const _t113 = [{ e: _t107, s: _t109 }, { e: _t110, s: _t112 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t113.length > 0) errs.push(..._t113);
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
