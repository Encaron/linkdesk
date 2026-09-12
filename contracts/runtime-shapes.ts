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
function chkUpdateInfo(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t23 = v as Record<string, unknown>;
    if (typeof _t23.version !== "string") errs.push(((p) + ".version") + ": 期望 string，实收 " + typeof _t23.version);
    if (typeof _t23.currentVersion !== "string") errs.push(((p) + ".currentVersion") + ": 期望 string，实收 " + typeof _t23.currentVersion);
    if (typeof _t23.publishedAt !== "string") errs.push(((p) + ".publishedAt") + ": 期望 string，实收 " + typeof _t23.publishedAt);
    if (typeof _t23.releaseNotesUrl !== "string") errs.push(((p) + ".releaseNotesUrl") + ": 期望 string，实收 " + typeof _t23.releaseNotesUrl);
    if (_t23.downloadUrl !== undefined) {
    if (typeof _t23.downloadUrl !== "string") errs.push(((p) + ".downloadUrl") + ": 期望 string，实收 " + typeof _t23.downloadUrl);
    }
    if (_t23.checksum !== undefined) {
    if (typeof _t23.checksum !== "string") errs.push(((p) + ".checksum") + ": 期望 string，实收 " + typeof _t23.checksum);
    }
    if (_t23.size !== undefined) {
    if (typeof _t23.size !== "number") errs.push(((p) + ".size") + ": 期望 number，实收 " + typeof _t23.size);
    }
  }
}
function chkUpdateError(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t24 = v as Record<string, unknown>;
    if (!(_t24.code === "network" || _t24.code === "rate-limited" || _t24.code === "not-found" || _t24.code === "invalid-response" || _t24.code === "asset-missing" || _t24.code === "version-unparsable" || _t24.code === "checksum-mismatch" || _t24.code === "checksum-unavailable" || _t24.code === "write-error" || _t24.code === "interrupted" || _t24.code === "canceled")) errs.push(((p) + ".code") + ": 期望 network|rate-limited|not-found|invalid-response|asset-missing|version-unparsable|checksum-mismatch|checksum-unavailable|write-error|interrupted|canceled");
    if (typeof _t24.message !== "string") errs.push(((p) + ".message") + ": 期望 string，实收 " + typeof _t24.message);
  }
}
function chkDownloadProgress(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t34 = v as Record<string, unknown>;
    if (typeof _t34.transferred !== "number") errs.push(((p) + ".transferred") + ": 期望 number，实收 " + typeof _t34.transferred);
    if (typeof _t34.total !== "number") errs.push(((p) + ".total") + ": 期望 number，实收 " + typeof _t34.total);
    if (typeof _t34.percent !== "number") errs.push(((p) + ".percent") + ": 期望 number，实收 " + typeof _t34.percent);
  }
}
function chkUpdateState(v: unknown, p: string, errs: string[]): void {
  const _t15: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t15.push((p) + ": 期望 object");
    else {
      const _t16 = v as Record<string, unknown>;
      if (_t16.type !== "uninitialized") _t15.push(((p) + ".type") + ": 期望 uninitialized");
    }
  const _t17 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "uninitialized" ? 1 : 0)) : 0);
  if (_t15.length > 0) {
  const _t18: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t18.push((p) + ": 期望 object");
    else {
      const _t19 = v as Record<string, unknown>;
      if (_t19.type !== "disabled") _t18.push(((p) + ".type") + ": 期望 disabled");
      if (typeof _t19.reason !== "string") _t18.push(((p) + ".reason") + ": 期望 string，实收 " + typeof _t19.reason);
    }
  const _t20 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "disabled" ? 1 : 0)) : 0);
  if (_t18.length > 0) {
  const _t21: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t21.push((p) + ": 期望 object");
    else {
      const _t22 = v as Record<string, unknown>;
      if (_t22.type !== "idle") _t21.push(((p) + ".type") + ": 期望 idle");
      if (_t22.update !== undefined) {
      chkUpdateInfo(_t22.update, ((p) + ".update"), _t21);
      }
      if (_t22.lastError !== undefined) {
      chkUpdateError(_t22.lastError, ((p) + ".lastError"), _t21);
      }
    }
  const _t25 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "idle" ? 1 : 0)) : 0);
  if (_t21.length > 0) {
  const _t26: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t26.push((p) + ": 期望 object");
    else {
      const _t27 = v as Record<string, unknown>;
      if (_t27.type !== "checking") _t26.push(((p) + ".type") + ": 期望 checking");
    }
  const _t28 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "checking" ? 1 : 0)) : 0);
  if (_t26.length > 0) {
  const _t29: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t29.push((p) + ": 期望 object");
    else {
      const _t30 = v as Record<string, unknown>;
      if (_t30.type !== "available") _t29.push(((p) + ".type") + ": 期望 available");
      chkUpdateInfo(_t30.update, ((p) + ".update"), _t29);
    }
  const _t31 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "available" ? 1 : 0)) : 0);
  if (_t29.length > 0) {
  const _t32: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t32.push((p) + ": 期望 object");
    else {
      const _t33 = v as Record<string, unknown>;
      if (_t33.type !== "downloading") _t32.push(((p) + ".type") + ": 期望 downloading");
      chkUpdateInfo(_t33.update, ((p) + ".update"), _t32);
      chkDownloadProgress(_t33.progress, ((p) + ".progress"), _t32);
    }
  const _t35 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "downloading" ? 1 : 0)) : 0);
  if (_t32.length > 0) {
  const _t36: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t36.push((p) + ": 期望 object");
    else {
      const _t37 = v as Record<string, unknown>;
      if (_t37.type !== "downloaded") _t36.push(((p) + ".type") + ": 期望 downloaded");
      chkUpdateInfo(_t37.update, ((p) + ".update"), _t36);
      if (_t37.warning !== undefined) {
      chkUpdateError(_t37.warning, ((p) + ".warning"), _t36);
      }
    }
  const _t38 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "downloaded" ? 1 : 0)) : 0);
  if (_t36.length > 0) {
  const _t39: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t39.push((p) + ": 期望 object");
    else {
      const _t40 = v as Record<string, unknown>;
      if (_t40.type !== "updating") _t39.push(((p) + ".type") + ": 期望 updating");
      chkUpdateInfo(_t40.update, ((p) + ".update"), _t39);
    }
  const _t41 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "updating" ? 1 : 0)) : 0);
  if (_t39.length > 0) {
  const _t42: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t42.push((p) + ": 期望 object");
    else {
      const _t43 = v as Record<string, unknown>;
      if (_t43.type !== "ready") _t42.push(((p) + ".type") + ": 期望 ready");
      chkUpdateInfo(_t43.update, ((p) + ".update"), _t42);
      if (_t43.warning !== undefined) {
      chkUpdateError(_t43.warning, ((p) + ".warning"), _t42);
      }
    }
  const _t44 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "ready" ? 1 : 0)) : 0);
  const _t45 = [{ e: _t15, s: _t17 }, { e: _t18, s: _t20 }, { e: _t21, s: _t25 }, { e: _t26, s: _t28 }, { e: _t29, s: _t31 }, { e: _t32, s: _t35 }, { e: _t36, s: _t38 }, { e: _t39, s: _t41 }, { e: _t42, s: _t44 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t45.length > 0) errs.push(..._t45);
  }
  }
  }
  }
  }
  }
  }
  }
}
function chkSerialDataPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t46 = v as Record<string, unknown>;
    if (typeof _t46.portName !== "string") errs.push(((p) + ".portName") + ": 期望 string，实收 " + typeof _t46.portName);
    if (typeof _t46.text !== "string") errs.push(((p) + ".text") + ": 期望 string，实收 " + typeof _t46.text);
  }
}
function chkSerialStatsPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t47 = v as Record<string, unknown>;
    if (typeof _t47.portName !== "string") errs.push(((p) + ".portName") + ": 期望 string，实收 " + typeof _t47.portName);
    if (_t47.tx !== undefined) {
    if (typeof _t47.tx !== "number") errs.push(((p) + ".tx") + ": 期望 number，实收 " + typeof _t47.tx);
    }
    if (_t47.rx !== undefined) {
    if (typeof _t47.rx !== "number") errs.push(((p) + ".rx") + ": 期望 number，实收 " + typeof _t47.rx);
    }
  }
}
function chkSerialSystemPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t48 = v as Record<string, unknown>;
    if (typeof _t48.portName !== "string") errs.push(((p) + ".portName") + ": 期望 string，实收 " + typeof _t48.portName);
    if (typeof _t48.message !== "string") errs.push(((p) + ".message") + ": 期望 string，实收 " + typeof _t48.message);
    if (!(_t48.type === "status" || _t48.type === "error")) errs.push(((p) + ".type") + ": 期望 status|error");
  }
}
function chkPoolMenuItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t54 = v as Record<string, unknown>;
    if (typeof _t54.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t54.label);
    if (typeof _t54.command !== "string") errs.push(((p) + ".command") + ": 期望 string，实收 " + typeof _t54.command);
    if (_t54.group !== undefined) {
    if (typeof _t54.group !== "string") errs.push(((p) + ".group") + ": 期望 string，实收 " + typeof _t54.group);
    }
    if (_t54.shortcut !== undefined) {
    if (typeof _t54.shortcut !== "string") errs.push(((p) + ".shortcut") + ": 期望 string，实收 " + typeof _t54.shortcut);
    }
    if (_t54.checked !== undefined) {
    if (!(_t54.checked === false || _t54.checked === true)) errs.push(((p) + ".checked") + ": 期望 false|true");
    }
    if (_t54.children !== undefined) {
    if (!Array.isArray(_t54.children)) errs.push(((p) + ".children") + ": 期望数组");
    else {
      for (let _t55 = 0; _t55 < _t54.children.length; _t55++) {
          chkPoolMenuItem(_t54.children[_t55], (((p) + ".children") + "[" + _t55 + "]"), errs);
      }
    }
    }
  }
}
function chkPoolMenuGroup(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t52 = v as Record<string, unknown>;
    if (typeof _t52.group !== "string") errs.push(((p) + ".group") + ": 期望 string，实收 " + typeof _t52.group);
    if (typeof _t52.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t52.label);
    if (!Array.isArray(_t52.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t53 = 0; _t53 < _t52.items.length; _t53++) {
          chkPoolMenuItem(_t52.items[_t53], (((p) + ".items") + "[" + _t53 + "]"), errs);
      }
    }
  }
}
function chkTitleBarSlotButton(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t58 = v as Record<string, unknown>;
    if (typeof _t58.command !== "string") errs.push(((p) + ".command") + ": 期望 string，实收 " + typeof _t58.command);
    if (_t58.icon !== undefined) {
    if (typeof _t58.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t58.icon);
    }
    if (typeof _t58.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t58.title);
  }
}
function chkTitleBarLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t50 = v as Record<string, unknown>;
    if (typeof _t50.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t50.title);
    if (typeof _t50.logoUrl !== "string") errs.push(((p) + ".logoUrl") + ": 期望 string，实收 " + typeof _t50.logoUrl);
    if (!(_t50.menuBarVisible === false || _t50.menuBarVisible === true)) errs.push(((p) + ".menuBarVisible") + ": 期望 false|true");
    if (!Array.isArray(_t50.menuGroups)) errs.push(((p) + ".menuGroups") + ": 期望数组");
    else {
      for (let _t51 = 0; _t51 < _t50.menuGroups.length; _t51++) {
          chkPoolMenuGroup(_t50.menuGroups[_t51], (((p) + ".menuGroups") + "[" + _t51 + "]"), errs);
      }
    }
    if (_t50.slots === null || typeof _t50.slots !== "object" || Array.isArray(_t50.slots)) errs.push(((p) + ".slots") + ": 期望 object");
    else {
      const _t56 = _t50.slots as Record<string, unknown>;
      if (!Array.isArray(_t56.left)) errs.push((((p) + ".slots") + ".left") + ": 期望数组");
      else {
        for (let _t57 = 0; _t57 < _t56.left.length; _t57++) {
            chkTitleBarSlotButton(_t56.left[_t57], ((((p) + ".slots") + ".left") + "[" + _t57 + "]"), errs);
        }
      }
      if (!Array.isArray(_t56.right)) errs.push((((p) + ".slots") + ".right") + ": 期望数组");
      else {
        for (let _t59 = 0; _t59 < _t56.right.length; _t59++) {
            chkTitleBarSlotButton(_t56.right[_t59], ((((p) + ".slots") + ".right") + "[" + _t59 + "]"), errs);
        }
      }
    }
    if (_t50.windowControls === null || typeof _t50.windowControls !== "object" || Array.isArray(_t50.windowControls)) errs.push(((p) + ".windowControls") + ": 期望 object");
    else {
      const _t60 = _t50.windowControls as Record<string, unknown>;
      if (typeof _t60.minimize !== "string") errs.push((((p) + ".windowControls") + ".minimize") + ": 期望 string，实收 " + typeof _t60.minimize);
      if (typeof _t60.maximize !== "string") errs.push((((p) + ".windowControls") + ".maximize") + ": 期望 string，实收 " + typeof _t60.maximize);
      if (typeof _t60.restore !== "string") errs.push((((p) + ".windowControls") + ".restore") + ": 期望 string，实收 " + typeof _t60.restore);
      if (typeof _t60.close !== "string") errs.push((((p) + ".windowControls") + ".close") + ": 期望 string，实收 " + typeof _t60.close);
      if (typeof _t60.pin !== "string") errs.push((((p) + ".windowControls") + ".pin") + ": 期望 string，实收 " + typeof _t60.pin);
      if (typeof _t60.unpin !== "string") errs.push((((p) + ".windowControls") + ".unpin") + ": 期望 string，实收 " + typeof _t60.unpin);
    }
  }
}
function chkIconBarIcon(v: unknown, p: string, errs: string[]): void {
  const _t64: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t64.push((p) + ": 期望 object");
    else {
      const _t65 = v as Record<string, unknown>;
      if (_t65.kind !== "lucide") _t64.push(((p) + ".kind") + ": 期望 lucide");
      if (typeof _t65.name !== "string") _t64.push(((p) + ".name") + ": 期望 string，实收 " + typeof _t65.name);
    }
  const _t66 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).kind === "lucide" ? 1 : 0)) : 0);
  if (_t64.length > 0) {
  const _t67: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t67.push((p) + ": 期望 object");
    else {
      const _t68 = v as Record<string, unknown>;
      if (_t68.kind !== "codicon") _t67.push(((p) + ".kind") + ": 期望 codicon");
      if (typeof _t68.name !== "string") _t67.push(((p) + ".name") + ": 期望 string，实收 " + typeof _t68.name);
      if (_t68.color !== undefined) {
      if (typeof _t68.color !== "string") _t67.push(((p) + ".color") + ": 期望 string，实收 " + typeof _t68.color);
      }
    }
  const _t69 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).kind === "codicon" ? 1 : 0)) : 0);
  if (_t67.length > 0) {
  const _t70: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t70.push((p) + ": 期望 object");
    else {
      const _t71 = v as Record<string, unknown>;
      if (_t71.kind !== "img") _t70.push(((p) + ".kind") + ": 期望 img");
      if (typeof _t71.src !== "string") _t70.push(((p) + ".src") + ": 期望 string，实收 " + typeof _t71.src);
    }
  const _t72 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).kind === "img" ? 1 : 0)) : 0);
  if (_t70.length > 0) {
  const _t73: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t73.push((p) + ": 期望 object");
    else {
      const _t74 = v as Record<string, unknown>;
      if (_t74.kind !== "emoji") _t73.push(((p) + ".kind") + ": 期望 emoji");
      if (typeof _t74.text !== "string") _t73.push(((p) + ".text") + ": 期望 string，实收 " + typeof _t74.text);
    }
  const _t75 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).kind === "emoji" ? 1 : 0)) : 0);
  const _t76 = [{ e: _t64, s: _t66 }, { e: _t67, s: _t69 }, { e: _t70, s: _t72 }, { e: _t73, s: _t75 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t76.length > 0) errs.push(..._t76);
  }
  }
  }
}
function chkIconBarItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t63 = v as Record<string, unknown>;
    if (typeof _t63.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t63.pluginId);
    chkIconBarIcon(_t63.icon, ((p) + ".icon"), errs);
    if (typeof _t63.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t63.label);
    if (!(_t63.location === "top" || _t63.location === "bottom")) errs.push(((p) + ".location") + ": 期望 top|bottom");
  }
}
function chkIconBarLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t61 = v as Record<string, unknown>;
    if (!Array.isArray(_t61.icons)) errs.push(((p) + ".icons") + ": 期望数组");
    else {
      for (let _t62 = 0; _t62 < _t61.icons.length; _t62++) {
          chkIconBarItem(_t61.icons[_t62], (((p) + ".icons") + "[" + _t62 + "]"), errs);
      }
    }
    if (_t61.activePluginId !== undefined) {
    if (typeof _t61.activePluginId !== "string") errs.push(((p) + ".activePluginId") + ": 期望 string，实收 " + typeof _t61.activePluginId);
    }
    if (!(_t61.hamburgerVisible === false || _t61.hamburgerVisible === true)) errs.push(((p) + ".hamburgerVisible") + ": 期望 false|true");
    if (typeof _t61.navLabel !== "string") errs.push(((p) + ".navLabel") + ": 期望 string，实收 " + typeof _t61.navLabel);
    if (_t61.hamburger !== undefined) {
    if (_t61.hamburger === null || typeof _t61.hamburger !== "object" || Array.isArray(_t61.hamburger)) errs.push(((p) + ".hamburger") + ": 期望 object");
    else {
      const _t77 = _t61.hamburger as Record<string, unknown>;
      if (typeof _t77.title !== "string") errs.push((((p) + ".hamburger") + ".title") + ": 期望 string，实收 " + typeof _t77.title);
      if (!Array.isArray(_t77.groups)) errs.push((((p) + ".hamburger") + ".groups") + ": 期望数组");
      else {
        for (let _t78 = 0; _t78 < _t77.groups.length; _t78++) {
            chkPoolMenuGroup(_t77.groups[_t78], ((((p) + ".hamburger") + ".groups") + "[" + _t78 + "]"), errs);
        }
      }
    }
    }
  }
}
function chkTitleActionItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t89 = v as Record<string, unknown>;
    if (typeof _t89.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t89.label);
    if (typeof _t89.command !== "string") errs.push(((p) + ".command") + ": 期望 string，实收 " + typeof _t89.command);
    if (_t89.args !== undefined) {
    }
  }
}
function chkTitleActionWidget(v: unknown, p: string, errs: string[]): void {
  const _t83: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t83.push((p) + ": 期望 object");
    else {
      const _t84 = v as Record<string, unknown>;
      if (_t84.type !== "icon") _t83.push(((p) + ".type") + ": 期望 icon");
      if (typeof _t84.id !== "string") _t83.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t84.id);
      if (typeof _t84.command !== "string") _t83.push(((p) + ".command") + ": 期望 string，实收 " + typeof _t84.command);
      if (typeof _t84.icon !== "string") _t83.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t84.icon);
      if (typeof _t84.title !== "string") _t83.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t84.title);
      if (_t84.args !== undefined) {
      }
    }
  const _t85 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "icon" ? 1 : 0)) : 0);
  if (_t83.length > 0) {
  const _t86: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t86.push((p) + ": 期望 object");
    else {
      const _t87 = v as Record<string, unknown>;
      if (_t87.type !== "dropdown") _t86.push(((p) + ".type") + ": 期望 dropdown");
      if (typeof _t87.id !== "string") _t86.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t87.id);
      if (!Array.isArray(_t87.items)) _t86.push(((p) + ".items") + ": 期望数组");
      else {
        for (let _t88 = 0; _t88 < _t87.items.length; _t88++) {
            chkTitleActionItem(_t87.items[_t88], (((p) + ".items") + "[" + _t88 + "]"), _t86);
        }
      }
      if (_t87.title !== undefined) {
      if (typeof _t87.title !== "string") _t86.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t87.title);
      }
    }
  const _t90 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "dropdown" ? 1 : 0)) : 0);
  if (_t86.length > 0) {
  const _t91: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t91.push((p) + ": 期望 object");
    else {
      const _t92 = v as Record<string, unknown>;
      if (_t92.type !== "split") _t91.push(((p) + ".type") + ": 期望 split");
      if (typeof _t92.id !== "string") _t91.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t92.id);
      if (typeof _t92.command !== "string") _t91.push(((p) + ".command") + ": 期望 string，实收 " + typeof _t92.command);
      if (_t92.icon !== undefined) {
      if (typeof _t92.icon !== "string") _t91.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t92.icon);
      }
      if (typeof _t92.title !== "string") _t91.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t92.title);
      if (!Array.isArray(_t92.items)) _t91.push(((p) + ".items") + ": 期望数组");
      else {
        for (let _t93 = 0; _t93 < _t92.items.length; _t93++) {
            chkTitleActionItem(_t92.items[_t93], (((p) + ".items") + "[" + _t93 + "]"), _t91);
        }
      }
      if (_t92.args !== undefined) {
      }
    }
  const _t94 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "split" ? 1 : 0)) : 0);
  const _t95 = [{ e: _t83, s: _t85 }, { e: _t86, s: _t90 }, { e: _t91, s: _t94 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t95.length > 0) errs.push(..._t95);
  }
  }
}
function chkSidebarViewMeta(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t81 = v as Record<string, unknown>;
    if (typeof _t81.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t81.id);
    if (typeof _t81.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t81.title);
    if (typeof _t81.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t81.pluginId);
    if (typeof _t81.renderPath !== "string") errs.push(((p) + ".renderPath") + ": 期望 string，实收 " + typeof _t81.renderPath);
    if (_t81.role !== undefined) {
    if (!(_t81.role === "toolbar" || _t81.role === "section")) errs.push(((p) + ".role") + ": 期望 toolbar|section");
    }
    if (_t81.order !== undefined) {
    if (typeof _t81.order !== "number") errs.push(((p) + ".order") + ": 期望 number，实收 " + typeof _t81.order);
    }
    if (_t81.collapsed !== undefined) {
    if (!(_t81.collapsed === false || _t81.collapsed === true)) errs.push(((p) + ".collapsed") + ": 期望 false|true");
    }
    if (_t81.badge !== undefined) {
    if (!(typeof _t81.badge === "string" || typeof _t81.badge === "number")) errs.push(((p) + ".badge") + ": 期望 string|number");
    }
    if (_t81.titleDescription !== undefined) {
    if (typeof _t81.titleDescription !== "string") errs.push(((p) + ".titleDescription") + ": 期望 string，实收 " + typeof _t81.titleDescription);
    }
    if (_t81.titleTooltip !== undefined) {
    if (typeof _t81.titleTooltip !== "string") errs.push(((p) + ".titleTooltip") + ": 期望 string，实收 " + typeof _t81.titleTooltip);
    }
    if (_t81.singleViewPaneContainerTitle !== undefined) {
    if (typeof _t81.singleViewPaneContainerTitle !== "string") errs.push(((p) + ".singleViewPaneContainerTitle") + ": 期望 string，实收 " + typeof _t81.singleViewPaneContainerTitle);
    }
    if (_t81.minHeight !== undefined) {
    if (typeof _t81.minHeight !== "number") errs.push(((p) + ".minHeight") + ": 期望 number，实收 " + typeof _t81.minHeight);
    }
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
function chkSidebarContainerLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t97 = v as Record<string, unknown>;
    if (typeof _t97.containerId !== "string") errs.push(((p) + ".containerId") + ": 期望 string，实收 " + typeof _t97.containerId);
    if (typeof _t97.containerTitle !== "string") errs.push(((p) + ".containerTitle") + ": 期望 string，实收 " + typeof _t97.containerTitle);
    if (_t97.mergeHeaderWhenSingle !== undefined) {
    if (!(_t97.mergeHeaderWhenSingle === false || _t97.mergeHeaderWhenSingle === true)) errs.push(((p) + ".mergeHeaderWhenSingle") + ": 期望 false|true");
    }
    if (!Array.isArray(_t97.views)) errs.push(((p) + ".views") + ": 期望数组");
    else {
      for (let _t98 = 0; _t98 < _t97.views.length; _t98++) {
          chkSidebarViewMeta(_t97.views[_t98], (((p) + ".views") + "[" + _t98 + "]"), errs);
      }
    }
  }
}
function chkSidebarLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t79 = v as Record<string, unknown>;
    if (!(_t79.visible === false || _t79.visible === true)) errs.push(((p) + ".visible") + ": 期望 false|true");
    if (typeof _t79.width !== "number") errs.push(((p) + ".width") + ": 期望 number，实收 " + typeof _t79.width);
    if (_t79.edge !== undefined) {
    if (!(_t79.edge === "left" || _t79.edge === "right")) errs.push(((p) + ".edge") + ": 期望 left|right");
    }
    if (!(_t79.containerId === null || typeof _t79.containerId === "string")) errs.push(((p) + ".containerId") + ": 期望 null|string");
    if (typeof _t79.containerTitle !== "string") errs.push(((p) + ".containerTitle") + ": 期望 string，实收 " + typeof _t79.containerTitle);
    if (_t79.mergeHeaderWhenSingle !== undefined) {
    if (!(_t79.mergeHeaderWhenSingle === false || _t79.mergeHeaderWhenSingle === true)) errs.push(((p) + ".mergeHeaderWhenSingle") + ": 期望 false|true");
    }
    if (!Array.isArray(_t79.views)) errs.push(((p) + ".views") + ": 期望数组");
    else {
      for (let _t80 = 0; _t80 < _t79.views.length; _t80++) {
          chkSidebarViewMeta(_t79.views[_t80], (((p) + ".views") + "[" + _t80 + "]"), errs);
      }
    }
    if (_t79.containers !== undefined) {
    if (!Array.isArray(_t79.containers)) errs.push(((p) + ".containers") + ": 期望数组");
    else {
      for (let _t96 = 0; _t96 < _t79.containers.length; _t96++) {
          chkSidebarContainerLayout(_t79.containers[_t96], (((p) + ".containers") + "[" + _t96 + "]"), errs);
      }
    }
    }
    if (_t79.collapsedViews !== undefined) {
    if (!Array.isArray(_t79.collapsedViews)) errs.push(((p) + ".collapsedViews") + ": 期望数组");
    else {
      for (let _t99 = 0; _t99 < _t79.collapsedViews.length; _t99++) {
          if (typeof _t79.collapsedViews[_t99] !== "string") errs.push((((p) + ".collapsedViews") + "[" + _t99 + "]") + ": 期望 string，实收 " + typeof _t79.collapsedViews[_t99]);
      }
    }
    }
    if (_t79.collapsed !== undefined) {
    if (!(_t79.collapsed === false || _t79.collapsed === true)) errs.push(((p) + ".collapsed") + ": 期望 false|true");
    }
    if (_t79.emptyText !== undefined) {
    if (typeof _t79.emptyText !== "string") errs.push(((p) + ".emptyText") + ": 期望 string，实收 " + typeof _t79.emptyText);
    }
    if (_t79.emptyHint !== undefined) {
    if (typeof _t79.emptyHint !== "string") errs.push(((p) + ".emptyHint") + ": 期望 string，实收 " + typeof _t79.emptyHint);
    }
    if (_t79.minWidth !== undefined) {
    if (typeof _t79.minWidth !== "number") errs.push(((p) + ".minWidth") + ": 期望 number，实收 " + typeof _t79.minWidth);
    }
    if (_t79.maxWidth !== undefined) {
    if (typeof _t79.maxWidth !== "number") errs.push(((p) + ".maxWidth") + ": 期望 number，实收 " + typeof _t79.maxWidth);
    }
    if (_t79.viewId !== undefined) {
    if (!(_t79.viewId === null || typeof _t79.viewId === "string")) errs.push(((p) + ".viewId") + ": 期望 null|string");
    }
  }
}
function chkRightSidebarLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t100 = v as Record<string, unknown>;
    if (!(_t100.visible === false || _t100.visible === true)) errs.push(((p) + ".visible") + ": 期望 false|true");
    if (typeof _t100.width !== "number") errs.push(((p) + ".width") + ": 期望 number，实收 " + typeof _t100.width);
    if (!(_t100.containerId === null || typeof _t100.containerId === "string")) errs.push(((p) + ".containerId") + ": 期望 null|string");
    if (typeof _t100.containerTitle !== "string") errs.push(((p) + ".containerTitle") + ": 期望 string，实收 " + typeof _t100.containerTitle);
    if (_t100.mergeHeaderWhenSingle !== undefined) {
    if (!(_t100.mergeHeaderWhenSingle === false || _t100.mergeHeaderWhenSingle === true)) errs.push(((p) + ".mergeHeaderWhenSingle") + ": 期望 false|true");
    }
    if (!Array.isArray(_t100.views)) errs.push(((p) + ".views") + ": 期望数组");
    else {
      for (let _t101 = 0; _t101 < _t100.views.length; _t101++) {
          chkSidebarViewMeta(_t100.views[_t101], (((p) + ".views") + "[" + _t101 + "]"), errs);
      }
    }
    if (_t100.containers !== undefined) {
    if (!Array.isArray(_t100.containers)) errs.push(((p) + ".containers") + ": 期望数组");
    else {
      for (let _t102 = 0; _t102 < _t100.containers.length; _t102++) {
          chkSidebarContainerLayout(_t100.containers[_t102], (((p) + ".containers") + "[" + _t102 + "]"), errs);
      }
    }
    }
    if (_t100.collapsedViews !== undefined) {
    if (!Array.isArray(_t100.collapsedViews)) errs.push(((p) + ".collapsedViews") + ": 期望数组");
    else {
      for (let _t103 = 0; _t103 < _t100.collapsedViews.length; _t103++) {
          if (typeof _t100.collapsedViews[_t103] !== "string") errs.push((((p) + ".collapsedViews") + "[" + _t103 + "]") + ": 期望 string，实收 " + typeof _t100.collapsedViews[_t103]);
      }
    }
    }
    if (_t100.collapsed !== undefined) {
    if (!(_t100.collapsed === false || _t100.collapsed === true)) errs.push(((p) + ".collapsed") + ": 期望 false|true");
    }
    if (_t100.minWidth !== undefined) {
    if (typeof _t100.minWidth !== "number") errs.push(((p) + ".minWidth") + ": 期望 number，实收 " + typeof _t100.minWidth);
    }
    if (_t100.maxWidth !== undefined) {
    if (typeof _t100.maxWidth !== "number") errs.push(((p) + ".maxWidth") + ": 期望 number，实收 " + typeof _t100.maxWidth);
    }
    if (_t100.emptyText !== undefined) {
    if (typeof _t100.emptyText !== "string") errs.push(((p) + ".emptyText") + ": 期望 string，实收 " + typeof _t100.emptyText);
    }
    if (_t100.emptyHint !== undefined) {
    if (typeof _t100.emptyHint !== "string") errs.push(((p) + ".emptyHint") + ": 期望 string，实收 " + typeof _t100.emptyHint);
    }
  }
}
function chkPoolTab(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t107 = v as Record<string, unknown>;
    if (typeof _t107.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t107.id);
    if (typeof _t107.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t107.pluginId);
    if (typeof _t107.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t107.title);
    if (_t107.sourceId !== undefined) {
    if (typeof _t107.sourceId !== "string") errs.push(((p) + ".sourceId") + ": 期望 string，实收 " + typeof _t107.sourceId);
    }
    if (_t107.dirty !== undefined) {
    if (!(_t107.dirty === false || _t107.dirty === true)) errs.push(((p) + ".dirty") + ": 期望 false|true");
    }
    if (_t107.icon !== undefined) {
    chkIconBarIcon(_t107.icon, ((p) + ".icon"), errs);
    }
    if (_t107.pinned !== undefined) {
    if (!(_t107.pinned === false || _t107.pinned === true)) errs.push(((p) + ".pinned") + ": 期望 false|true");
    }
    if (_t107.closeBehavior !== undefined) {
    if (!(_t107.closeBehavior === "normal" || _t107.closeBehavior === "confirm" || _t107.closeBehavior === "blocked")) errs.push(((p) + ".closeBehavior") + ": 期望 normal|confirm|blocked");
    }
    if (_t107.singleton !== undefined) {
    if (!(_t107.singleton === false || _t107.singleton === true)) errs.push(((p) + ".singleton") + ": 期望 false|true");
    }
    if (_t107.shellRendered !== undefined) {
    if (!(_t107.shellRendered === false || _t107.shellRendered === true)) errs.push(((p) + ".shellRendered") + ": 期望 false|true");
    }
    if (_t107.shellType !== undefined) {
    if (typeof _t107.shellType !== "string") errs.push(((p) + ".shellType") + ": 期望 string，实收 " + typeof _t107.shellType);
    }
    if (_t107.detailPluginId !== undefined) {
    if (typeof _t107.detailPluginId !== "string") errs.push(((p) + ".detailPluginId") + ": 期望 string，实收 " + typeof _t107.detailPluginId);
    }
    if (_t107.detailContributorId !== undefined) {
    if (typeof _t107.detailContributorId !== "string") errs.push(((p) + ".detailContributorId") + ": 期望 string，实收 " + typeof _t107.detailContributorId);
    }
    if (_t107.detailViewRenderPath !== undefined) {
    if (typeof _t107.detailViewRenderPath !== "string") errs.push(((p) + ".detailViewRenderPath") + ": 期望 string，实收 " + typeof _t107.detailViewRenderPath);
    }
  }
}
function chkPoolGroup(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t105 = v as Record<string, unknown>;
    if (typeof _t105.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t105.id);
    if (typeof _t105.flex !== "number") errs.push(((p) + ".flex") + ": 期望 number，实收 " + typeof _t105.flex);
    if (typeof _t105.activeTabId !== "string") errs.push(((p) + ".activeTabId") + ": 期望 string，实收 " + typeof _t105.activeTabId);
    if (!Array.isArray(_t105.tabs)) errs.push(((p) + ".tabs") + ": 期望数组");
    else {
      for (let _t106 = 0; _t106 < _t105.tabs.length; _t106++) {
          chkPoolTab(_t105.tabs[_t106], (((p) + ".tabs") + "[" + _t106 + "]"), errs);
      }
    }
  }
}
function chkSplitNode(v: unknown, p: string, errs: string[]): void {
  const _t108: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t108.push((p) + ": 期望 object");
    else {
      const _t109 = v as Record<string, unknown>;
      if (_t109.type !== "leaf") _t108.push(((p) + ".type") + ": 期望 leaf");
      if (typeof _t109.groupId !== "string") _t108.push(((p) + ".groupId") + ": 期望 string，实收 " + typeof _t109.groupId);
    }
  const _t110 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "leaf" ? 1 : 0)) : 0);
  if (_t108.length > 0) {
  const _t111: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t111.push((p) + ": 期望 object");
    else {
      const _t112 = v as Record<string, unknown>;
      if (_t112.type !== "branch") _t111.push(((p) + ".type") + ": 期望 branch");
      if (!(_t112.direction === "horizontal" || _t112.direction === "vertical")) _t111.push(((p) + ".direction") + ": 期望 horizontal|vertical");
      if (!Array.isArray(_t112.children)) _t111.push(((p) + ".children") + ": 期望数组");
      else {
        if (_t112.children.length !== 2) _t111.push(((p) + ".children") + ": 期望长度 2");
          chkSplitNode(_t112.children[0], (((p) + ".children") + "[0]"), _t111);
          chkSplitNode(_t112.children[1], (((p) + ".children") + "[1]"), _t111);
      }
      if (!Array.isArray(_t112.sizes)) _t111.push(((p) + ".sizes") + ": 期望数组");
      else {
        if (_t112.sizes.length !== 2) _t111.push(((p) + ".sizes") + ": 期望长度 2");
          if (typeof _t112.sizes[0] !== "number") _t111.push((((p) + ".sizes") + "[0]") + ": 期望 number，实收 " + typeof _t112.sizes[0]);
          if (typeof _t112.sizes[1] !== "number") _t111.push((((p) + ".sizes") + "[1]") + ": 期望 number，实收 " + typeof _t112.sizes[1]);
      }
    }
  const _t113 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "branch" ? 1 : 0) + (((v as Record<string, unknown>).direction === "horizontal") || ((v as Record<string, unknown>).direction === "vertical") ? 1 : 0)) : 0);
  const _t114 = [{ e: _t108, s: _t110 }, { e: _t111, s: _t113 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t114.length > 0) errs.push(..._t114);
  }
}
function chkCreatableViewMeta(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t116 = v as Record<string, unknown>;
    if (typeof _t116.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t116.pluginId);
    if (typeof _t116.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t116.label);
  }
}
function chkPanelViewMeta(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t119 = v as Record<string, unknown>;
    if (typeof _t119.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t119.id);
    if (typeof _t119.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t119.title);
    if (typeof _t119.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t119.pluginId);
    if (typeof _t119.renderPath !== "string") errs.push(((p) + ".renderPath") + ": 期望 string，实收 " + typeof _t119.renderPath);
    if (_t119.titleActions !== undefined) {
    if (!Array.isArray(_t119.titleActions)) errs.push(((p) + ".titleActions") + ": 期望数组");
    else {
      for (let _t120 = 0; _t120 < _t119.titleActions.length; _t120++) {
          chkTitleActionWidget(_t119.titleActions[_t120], (((p) + ".titleActions") + "[" + _t120 + "]"), errs);
      }
    }
    }
  }
}
function chkPanelSwitcherItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t124 = v as Record<string, unknown>;
    if (typeof _t124.viewId !== "string") errs.push(((p) + ".viewId") + ": 期望 string，实收 " + typeof _t124.viewId);
    if (typeof _t124.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t124.title);
    if (typeof _t124.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t124.pluginId);
    if (!(_t124.visible === false || _t124.visible === true)) errs.push(((p) + ".visible") + ": 期望 false|true");
    if (!(_t124.active === false || _t124.active === true)) errs.push(((p) + ".active") + ": 期望 false|true");
  }
}
function chkPanelSwitcherGroup(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t122 = v as Record<string, unknown>;
    if (typeof _t122.containerId !== "string") errs.push(((p) + ".containerId") + ": 期望 string，实收 " + typeof _t122.containerId);
    if (typeof _t122.containerTitle !== "string") errs.push(((p) + ".containerTitle") + ": 期望 string，实收 " + typeof _t122.containerTitle);
    if (!Array.isArray(_t122.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t123 = 0; _t123 < _t122.items.length; _t123++) {
          chkPanelSwitcherItem(_t122.items[_t123], (((p) + ".items") + "[" + _t123 + "]"), errs);
      }
    }
  }
}
function chkPanelLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t117 = v as Record<string, unknown>;
    if (!(_t117.visible === false || _t117.visible === true)) errs.push(((p) + ".visible") + ": 期望 false|true");
    if (typeof _t117.height !== "number") errs.push(((p) + ".height") + ": 期望 number，实收 " + typeof _t117.height);
    if (_t117.edge !== undefined) {
    if (!(_t117.edge === "top" || _t117.edge === "bottom" || _t117.edge === "left" || _t117.edge === "right")) errs.push(((p) + ".edge") + ": 期望 top|bottom|left|right");
    }
    if (_t117.align !== undefined) {
    if (!(_t117.align === "left" || _t117.align === "right" || _t117.align === "center" || _t117.align === "justify")) errs.push(((p) + ".align") + ": 期望 left|right|center|justify");
    }
    if (_t117.width !== undefined) {
    if (typeof _t117.width !== "number") errs.push(((p) + ".width") + ": 期望 number，实收 " + typeof _t117.width);
    }
    if (typeof _t117.activeViewId !== "string") errs.push(((p) + ".activeViewId") + ": 期望 string，实收 " + typeof _t117.activeViewId);
    if (!Array.isArray(_t117.views)) errs.push(((p) + ".views") + ": 期望数组");
    else {
      for (let _t118 = 0; _t118 < _t117.views.length; _t118++) {
          chkPanelViewMeta(_t117.views[_t118], (((p) + ".views") + "[" + _t118 + "]"), errs);
      }
    }
    if (_t117.minHeight !== undefined) {
    if (typeof _t117.minHeight !== "number") errs.push(((p) + ".minHeight") + ": 期望 number，实收 " + typeof _t117.minHeight);
    }
    if (_t117.maxHeight !== undefined) {
    if (typeof _t117.maxHeight !== "number") errs.push(((p) + ".maxHeight") + ": 期望 number，实收 " + typeof _t117.maxHeight);
    }
    if (_t117.minWidth !== undefined) {
    if (typeof _t117.minWidth !== "number") errs.push(((p) + ".minWidth") + ": 期望 number，实收 " + typeof _t117.minWidth);
    }
    if (_t117.maxWidth !== undefined) {
    if (typeof _t117.maxWidth !== "number") errs.push(((p) + ".maxWidth") + ": 期望 number，实收 " + typeof _t117.maxWidth);
    }
    if (_t117.createTooltip !== undefined) {
    if (typeof _t117.createTooltip !== "string") errs.push(((p) + ".createTooltip") + ": 期望 string，实收 " + typeof _t117.createTooltip);
    }
    if (_t117.switcher !== undefined) {
    if (!Array.isArray(_t117.switcher)) errs.push(((p) + ".switcher") + ": 期望数组");
    else {
      for (let _t121 = 0; _t121 < _t117.switcher.length; _t121++) {
          chkPanelSwitcherGroup(_t117.switcher[_t121], (((p) + ".switcher") + "[" + _t121 + "]"), errs);
      }
    }
    }
    if (_t117.emptyText !== undefined) {
    if (typeof _t117.emptyText !== "string") errs.push(((p) + ".emptyText") + ": 期望 string，实收 " + typeof _t117.emptyText);
    }
    if (_t117.emptyHint !== undefined) {
    if (typeof _t117.emptyHint !== "string") errs.push(((p) + ".emptyHint") + ": 期望 string，实收 " + typeof _t117.emptyHint);
    }
    if (_t117.detachable !== undefined) {
    if (!(_t117.detachable === false || _t117.detachable === true)) errs.push(((p) + ".detachable") + ": 期望 false|true");
    }
    if (_t117.detachTooltip !== undefined) {
    if (typeof _t117.detachTooltip !== "string") errs.push(((p) + ".detachTooltip") + ": 期望 string，实收 " + typeof _t117.detachTooltip);
    }
  }
}
function chkPoolStatusBarItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t127 = v as Record<string, unknown>;
    if (typeof _t127.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t127.id);
    if (typeof _t127.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t127.pluginId);
    if (_t127.icon !== undefined) {
    if (typeof _t127.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t127.icon);
    }
    if (typeof _t127.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t127.label);
    if (_t127.title !== undefined) {
    if (typeof _t127.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t127.title);
    }
    if (!(_t127.align === "left" || _t127.align === "right")) errs.push(((p) + ".align") + ": 期望 left|right");
    if (_t127.onClick !== undefined) {
    if (typeof _t127.onClick !== "string") errs.push(((p) + ".onClick") + ": 期望 string，实收 " + typeof _t127.onClick);
    }
    if (_t127.componentRenderPath !== undefined) {
    if (typeof _t127.componentRenderPath !== "string") errs.push(((p) + ".componentRenderPath") + ": 期望 string，实收 " + typeof _t127.componentRenderPath);
    }
    if (_t127.dividerBefore !== undefined) {
    if (!(_t127.dividerBefore === false || _t127.dividerBefore === true)) errs.push(((p) + ".dividerBefore") + ": 期望 false|true");
    }
  }
}
function chkNotifJobRow(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t132 = v as Record<string, unknown>;
    if (typeof _t132.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t132.id);
    if (typeof _t132.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t132.pluginId);
    if (typeof _t132.name !== "string") errs.push(((p) + ".name") + ": 期望 string，实收 " + typeof _t132.name);
    if (typeof _t132.iconClass !== "string") errs.push(((p) + ".iconClass") + ": 期望 string，实收 " + typeof _t132.iconClass);
    if (typeof _t132.statusLabel !== "string") errs.push(((p) + ".statusLabel") + ": 期望 string，实收 " + typeof _t132.statusLabel);
    if (_t132.percent !== undefined) {
    if (typeof _t132.percent !== "number") errs.push(((p) + ".percent") + ": 期望 number，实收 " + typeof _t132.percent);
    }
    if (_t132.cancellable !== undefined) {
    if (!(_t132.cancellable === false || _t132.cancellable === true)) errs.push(((p) + ".cancellable") + ": 期望 false|true");
    }
    if (_t132.cancelLabel !== undefined) {
    if (typeof _t132.cancelLabel !== "string") errs.push(((p) + ".cancelLabel") + ": 期望 string，实收 " + typeof _t132.cancelLabel);
    }
  }
}
function chkNotifSection(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t130 = v as Record<string, unknown>;
    if (typeof _t130.key !== "string") errs.push(((p) + ".key") + ": 期望 string，实收 " + typeof _t130.key);
    if (typeof _t130.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t130.label);
    if (!Array.isArray(_t130.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t131 = 0; _t131 < _t130.items.length; _t131++) {
          chkNotifJobRow(_t130.items[_t131], (((p) + ".items") + "[" + _t131 + "]"), errs);
      }
    }
    if (_t130.foldedLabel !== undefined) {
    if (typeof _t130.foldedLabel !== "string") errs.push(((p) + ".foldedLabel") + ": 期望 string，实收 " + typeof _t130.foldedLabel);
    }
  }
}
function chkNotifAction(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t138 = v as Record<string, unknown>;
    if (typeof _t138.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t138.label);
    if (_t138.isPrimary !== undefined) {
    if (!(_t138.isPrimary === false || _t138.isPrimary === true)) errs.push(((p) + ".isPrimary") + ": 期望 false|true");
    }
  }
}
function chkNotifItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t136 = v as Record<string, unknown>;
    if (typeof _t136.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t136.id);
    if (typeof _t136.iconClass !== "string") errs.push(((p) + ".iconClass") + ": 期望 string，实收 " + typeof _t136.iconClass);
    if (typeof _t136.message !== "string") errs.push(((p) + ".message") + ": 期望 string，实收 " + typeof _t136.message);
    if (typeof _t136.timeLabel !== "string") errs.push(((p) + ".timeLabel") + ": 期望 string，实收 " + typeof _t136.timeLabel);
    if (_t136.sourceLabel !== undefined) {
    if (typeof _t136.sourceLabel !== "string") errs.push(((p) + ".sourceLabel") + ": 期望 string，实收 " + typeof _t136.sourceLabel);
    }
    if (!Array.isArray(_t136.actions)) errs.push(((p) + ".actions") + ": 期望数组");
    else {
      for (let _t137 = 0; _t137 < _t136.actions.length; _t137++) {
          chkNotifAction(_t136.actions[_t137], (((p) + ".actions") + "[" + _t137 + "]"), errs);
      }
    }
    if (_t136.progress !== undefined) {
    if (!(_t136.progress === false || _t136.progress === true)) errs.push(((p) + ".progress") + ": 期望 false|true");
    }
    if (_t136.percent !== undefined) {
    if (typeof _t136.percent !== "number") errs.push(((p) + ".percent") + ": 期望 number，实收 " + typeof _t136.percent);
    }
  }
}
function chkNotifGroup(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t134 = v as Record<string, unknown>;
    if (typeof _t134.key !== "string") errs.push(((p) + ".key") + ": 期望 string，实收 " + typeof _t134.key);
    if (typeof _t134.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t134.label);
    if (typeof _t134.unread !== "number") errs.push(((p) + ".unread") + ": 期望 number，实收 " + typeof _t134.unread);
    if (!Array.isArray(_t134.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t135 = 0; _t135 < _t134.items.length; _t135++) {
          chkNotifItem(_t134.items[_t135], (((p) + ".items") + "[" + _t135 + "]"), errs);
      }
    }
    if (_t134.foldedLabel !== undefined) {
    if (typeof _t134.foldedLabel !== "string") errs.push(((p) + ".foldedLabel") + ": 期望 string，实收 " + typeof _t134.foldedLabel);
    }
  }
}
function chkNotifLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t128 = v as Record<string, unknown>;
    if (typeof _t128.unread !== "number") errs.push(((p) + ".unread") + ": 期望 number，实收 " + typeof _t128.unread);
    if (typeof _t128.bellTitle !== "string") errs.push(((p) + ".bellTitle") + ": 期望 string，实收 " + typeof _t128.bellTitle);
    if (typeof _t128.panelTitle !== "string") errs.push(((p) + ".panelTitle") + ": 期望 string，实收 " + typeof _t128.panelTitle);
    if (typeof _t128.clearLabel !== "string") errs.push(((p) + ".clearLabel") + ": 期望 string，实收 " + typeof _t128.clearLabel);
    if (typeof _t128.minimizeLabel !== "string") errs.push(((p) + ".minimizeLabel") + ": 期望 string，实收 " + typeof _t128.minimizeLabel);
    if (typeof _t128.emptyLabel !== "string") errs.push(((p) + ".emptyLabel") + ": 期望 string，实收 " + typeof _t128.emptyLabel);
    if (typeof _t128.dismissTitle !== "string") errs.push(((p) + ".dismissTitle") + ": 期望 string，实收 " + typeof _t128.dismissTitle);
    if (_t128.summaryLabel !== undefined) {
    if (typeof _t128.summaryLabel !== "string") errs.push(((p) + ".summaryLabel") + ": 期望 string，实收 " + typeof _t128.summaryLabel);
    }
    if (_t128.sections !== undefined) {
    if (!Array.isArray(_t128.sections)) errs.push(((p) + ".sections") + ": 期望数组");
    else {
      for (let _t129 = 0; _t129 < _t128.sections.length; _t129++) {
          chkNotifSection(_t128.sections[_t129], (((p) + ".sections") + "[" + _t129 + "]"), errs);
      }
    }
    }
    if (_t128.resultLabel !== undefined) {
    if (typeof _t128.resultLabel !== "string") errs.push(((p) + ".resultLabel") + ": 期望 string，实收 " + typeof _t128.resultLabel);
    }
    if (_t128.resultSummary !== undefined) {
    if (typeof _t128.resultSummary !== "string") errs.push(((p) + ".resultSummary") + ": 期望 string，实收 " + typeof _t128.resultSummary);
    }
    if (!Array.isArray(_t128.groups)) errs.push(((p) + ".groups") + ": 期望数组");
    else {
      for (let _t133 = 0; _t133 < _t128.groups.length; _t133++) {
          chkNotifGroup(_t128.groups[_t133], (((p) + ".groups") + "[" + _t133 + "]"), errs);
      }
    }
    if (_t128.autoOpen !== undefined) {
    if (!(_t128.autoOpen === false || _t128.autoOpen === true)) errs.push(((p) + ".autoOpen") + ": 期望 false|true");
    }
  }
}
function chkStatusBarLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t125 = v as Record<string, unknown>;
    if (!Array.isArray(_t125.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t126 = 0; _t126 < _t125.items.length; _t126++) {
          chkPoolStatusBarItem(_t125.items[_t126], (((p) + ".items") + "[" + _t126 + "]"), errs);
      }
    }
    if (_t125.chordLabel !== undefined) {
    if (typeof _t125.chordLabel !== "string") errs.push(((p) + ".chordLabel") + ": 期望 string，实收 " + typeof _t125.chordLabel);
    }
    chkNotifLayout(_t125.notif, ((p) + ".notif"), errs);
  }
}
function chkPoolLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t49 = v as Record<string, unknown>;
    if (_t49.version !== 2) errs.push(((p) + ".version") + ": 期望 2");
    chkTitleBarLayout(_t49.titleBar, ((p) + ".titleBar"), errs);
    if (_t49.iconBar !== undefined) {
    chkIconBarLayout(_t49.iconBar, ((p) + ".iconBar"), errs);
    }
    if (_t49.sidebar !== undefined) {
    chkSidebarLayout(_t49.sidebar, ((p) + ".sidebar"), errs);
    }
    if (_t49.rightSidebar !== undefined) {
    chkRightSidebarLayout(_t49.rightSidebar, ((p) + ".rightSidebar"), errs);
    }
    if (!Array.isArray(_t49.groups)) errs.push(((p) + ".groups") + ": 期望数组");
    else {
      for (let _t104 = 0; _t104 < _t49.groups.length; _t104++) {
          chkPoolGroup(_t49.groups[_t104], (((p) + ".groups") + "[" + _t104 + "]"), errs);
      }
    }
    if (_t49.activeGroupId !== undefined) {
    if (typeof _t49.activeGroupId !== "string") errs.push(((p) + ".activeGroupId") + ": 期望 string，实收 " + typeof _t49.activeGroupId);
    }
    if (_t49.root !== undefined) {
    chkSplitNode(_t49.root, ((p) + ".root"), errs);
    }
    if (_t49.creatableViews !== undefined) {
    if (!Array.isArray(_t49.creatableViews)) errs.push(((p) + ".creatableViews") + ": 期望数组");
    else {
      for (let _t115 = 0; _t115 < _t49.creatableViews.length; _t115++) {
          chkCreatableViewMeta(_t49.creatableViews[_t115], (((p) + ".creatableViews") + "[" + _t115 + "]"), errs);
      }
    }
    }
    if (_t49.panel !== undefined) {
    chkPanelLayout(_t49.panel, ((p) + ".panel"), errs);
    }
    if (_t49.statusBar !== undefined) {
    chkStatusBarLayout(_t49.statusBar, ((p) + ".statusBar"), errs);
    }
  }
}
function chkPoolQuickPickButton(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t143 = v as Record<string, unknown>;
    if (typeof _t143.actionId !== "string") errs.push(((p) + ".actionId") + ": 期望 string，实收 " + typeof _t143.actionId);
    if (typeof _t143.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t143.icon);
    if (_t143.tooltip !== undefined) {
    if (typeof _t143.tooltip !== "string") errs.push(((p) + ".tooltip") + ": 期望 string，实收 " + typeof _t143.tooltip);
    }
  }
}
function chkPoolQuickPickItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t141 = v as Record<string, unknown>;
    if (typeof _t141.key !== "string") errs.push(((p) + ".key") + ": 期望 string，实收 " + typeof _t141.key);
    if (typeof _t141.searchText !== "string") errs.push(((p) + ".searchText") + ": 期望 string，实收 " + typeof _t141.searchText);
    if (_t141.checked !== undefined) {
    if (!(_t141.checked === false || _t141.checked === true)) errs.push(((p) + ".checked") + ": 期望 false|true");
    }
    if (typeof _t141.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t141.label);
    if (_t141.category !== undefined) {
    if (typeof _t141.category !== "string") errs.push(((p) + ".category") + ": 期望 string，实收 " + typeof _t141.category);
    }
    if (_t141.detail !== undefined) {
    if (typeof _t141.detail !== "string") errs.push(((p) + ".detail") + ": 期望 string，实收 " + typeof _t141.detail);
    }
    if (_t141.keybinding !== undefined) {
    if (typeof _t141.keybinding !== "string") errs.push(((p) + ".keybinding") + ": 期望 string，实收 " + typeof _t141.keybinding);
    }
    if (_t141.buttons !== undefined) {
    if (!Array.isArray(_t141.buttons)) errs.push(((p) + ".buttons") + ": 期望数组");
    else {
      for (let _t142 = 0; _t142 < _t141.buttons.length; _t142++) {
          chkPoolQuickPickButton(_t141.buttons[_t142], (((p) + ".buttons") + "[" + _t142 + "]"), errs);
      }
    }
    }
  }
}
function chkPoolQuickPickData(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t139 = v as Record<string, unknown>;
    if (!(_t139.open === false || _t139.open === true)) errs.push(((p) + ".open") + ": 期望 false|true");
    if (typeof _t139.placeholder !== "string") errs.push(((p) + ".placeholder") + ": 期望 string，实收 " + typeof _t139.placeholder);
    if (_t139.prefix !== undefined) {
    if (typeof _t139.prefix !== "string") errs.push(((p) + ".prefix") + ": 期望 string，实收 " + typeof _t139.prefix);
    }
    if (!Array.isArray(_t139.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t140 = 0; _t140 < _t139.items.length; _t140++) {
          chkPoolQuickPickItem(_t139.items[_t140], (((p) + ".items") + "[" + _t140 + "]"), errs);
      }
    }
  }
}
function chkPoolDialogData(v: unknown, p: string, errs: string[]): void {
  const _t144: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t144.push((p) + ": 期望 object");
    else {
      const _t145 = v as Record<string, unknown>;
      if (_t145.open !== false) _t144.push(((p) + ".open") + ": 期望 false");
    }
  const _t146 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).open === false ? 1 : 0)) : 0);
  if (_t144.length > 0) {
  const _t147: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t147.push((p) + ": 期望 object");
    else {
      const _t148 = v as Record<string, unknown>;
      if (_t148.open !== true) _t147.push(((p) + ".open") + ": 期望 true");
      if (typeof _t148.title !== "string") _t147.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t148.title);
      if (typeof _t148.message !== "string") _t147.push(((p) + ".message") + ": 期望 string，实收 " + typeof _t148.message);
      if (_t148.confirmLabel !== undefined) {
      if (typeof _t148.confirmLabel !== "string") _t147.push(((p) + ".confirmLabel") + ": 期望 string，实收 " + typeof _t148.confirmLabel);
      }
      if (_t148.cancelLabel !== undefined) {
      if (typeof _t148.cancelLabel !== "string") _t147.push(((p) + ".cancelLabel") + ": 期望 string，实收 " + typeof _t148.cancelLabel);
      }
      if (!(_t148.isAlert === false || _t148.isAlert === true)) _t147.push(((p) + ".isAlert") + ": 期望 false|true");
      if (_t148.content !== undefined) {
      if (_t148.content === null || typeof _t148.content !== "object" || Array.isArray(_t148.content)) _t147.push(((p) + ".content") + ": 期望 object");
      else {
        const _t149 = _t148.content as Record<string, unknown>;
        if (typeof _t149.pluginId !== "string") _t147.push((((p) + ".content") + ".pluginId") + ": 期望 string，实收 " + typeof _t149.pluginId);
        if (typeof _t149.renderPath !== "string") _t147.push((((p) + ".content") + ".renderPath") + ": 期望 string，实收 " + typeof _t149.renderPath);
        if (_t149.payload !== undefined) {
        }
      }
      }
    }
  const _t150 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).open === true ? 1 : 0) + (((v as Record<string, unknown>).isAlert === false) || ((v as Record<string, unknown>).isAlert === true) ? 1 : 0)) : 0);
  const _t151 = [{ e: _t144, s: _t146 }, { e: _t147, s: _t150 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t151.length > 0) errs.push(..._t151);
  }
}
function chkPoolFloatingPanelButton(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t158 = v as Record<string, unknown>;
    if (typeof _t158.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t158.id);
    if (typeof _t158.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t158.label);
    if (typeof _t158.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t158.icon);
    if (_t158.toggledIcon !== undefined) {
    if (typeof _t158.toggledIcon !== "string") errs.push(((p) + ".toggledIcon") + ": 期望 string，实收 " + typeof _t158.toggledIcon);
    }
    if (_t158.toggledLabel !== undefined) {
    if (typeof _t158.toggledLabel !== "string") errs.push(((p) + ".toggledLabel") + ": 期望 string，实收 " + typeof _t158.toggledLabel);
    }
    if (_t158.expandOnHover !== undefined) {
    if (!(_t158.expandOnHover === false || _t158.expandOnHover === true)) errs.push(((p) + ".expandOnHover") + ": 期望 false|true");
    }
  }
}
function chkPoolFloatingPanelData(v: unknown, p: string, errs: string[]): void {
  const _t152: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t152.push((p) + ": 期望 object");
    else {
      const _t153 = v as Record<string, unknown>;
      if (_t153.open !== false) _t152.push(((p) + ".open") + ": 期望 false");
    }
  const _t154 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).open === false ? 1 : 0)) : 0);
  if (_t152.length > 0) {
  const _t155: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t155.push((p) + ": 期望 object");
    else {
      const _t156 = v as Record<string, unknown>;
      if (_t156.open !== true) _t155.push(((p) + ".open") + ": 期望 true");
      if (typeof _t156.viewId !== "string") _t155.push(((p) + ".viewId") + ": 期望 string，实收 " + typeof _t156.viewId);
      if (typeof _t156.title !== "string") _t155.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t156.title);
      if (typeof _t156.pluginId !== "string") _t155.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t156.pluginId);
      if (typeof _t156.renderPath !== "string") _t155.push(((p) + ".renderPath") + ": 期望 string，实收 " + typeof _t156.renderPath);
      if (!Array.isArray(_t156.actions)) _t155.push(((p) + ".actions") + ": 期望数组");
      else {
        for (let _t157 = 0; _t157 < _t156.actions.length; _t157++) {
            chkPoolFloatingPanelButton(_t156.actions[_t157], (((p) + ".actions") + "[" + _t157 + "]"), _t155);
        }
      }
      if (_t156.refresh !== undefined) {
      if (!(_t156.refresh === false || _t156.refresh === true)) _t155.push(((p) + ".refresh") + ": 期望 false|true");
      }
    }
  const _t159 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).open === true ? 1 : 0) + (((v as Record<string, unknown>).refresh === false) || ((v as Record<string, unknown>).refresh === true) ? 1 : 0)) : 0);
  const _t160 = [{ e: _t152, s: _t154 }, { e: _t155, s: _t159 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t160.length > 0) errs.push(..._t160);
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
export function assertUpdateState(v: unknown): string[] {
  const errs: string[] = [];
  chkUpdateState(v, "payload", errs);
  return errs;
}
export function assertDownloadProgress(v: unknown): string[] {
  const errs: string[] = [];
  chkDownloadProgress(v, "payload", errs);
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
    case "update:stateChanged": return assertUpdateState(payload);
    case "update:progress": return assertDownloadProgress(payload);
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
