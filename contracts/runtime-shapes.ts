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
    if (!(_t24.code === "network" || _t24.code === "rate-limited" || _t24.code === "not-found" || _t24.code === "invalid-response" || _t24.code === "asset-missing" || _t24.code === "version-unparsable" || _t24.code === "checksum-mismatch" || _t24.code === "checksum-unavailable" || _t24.code === "write-error" || _t24.code === "interrupted" || _t24.code === "canceled" || _t24.code === "install-interrupted")) errs.push(((p) + ".code") + ": 期望 network|rate-limited|not-found|invalid-response|asset-missing|version-unparsable|checksum-mismatch|checksum-unavailable|write-error|interrupted|canceled|install-interrupted");
    if (typeof _t24.message !== "string") errs.push(((p) + ".message") + ": 期望 string，实收 " + typeof _t24.message);
    if (_t24.params !== undefined) {
    if (_t24.params === null || typeof _t24.params !== "object" || Array.isArray(_t24.params)) errs.push(((p) + ".params") + ": 期望 object");
    else {
      const _t25 = _t24.params as Record<string, unknown>;
      for (const _t26 of Object.keys(_t25)) {
      if (!(typeof _t25[_t26] === "string" || typeof _t25[_t26] === "number")) errs.push((((p) + ".params") + "[\"" + _t26 + "\"]") + ": 期望 string|number");
      }
    }
    }
  }
}
function chkDownloadProgress(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t36 = v as Record<string, unknown>;
    if (typeof _t36.transferred !== "number") errs.push(((p) + ".transferred") + ": 期望 number，实收 " + typeof _t36.transferred);
    if (typeof _t36.total !== "number") errs.push(((p) + ".total") + ": 期望 number，实收 " + typeof _t36.total);
    if (typeof _t36.percent !== "number") errs.push(((p) + ".percent") + ": 期望 number，实收 " + typeof _t36.percent);
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
  const _t27 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "idle" ? 1 : 0)) : 0);
  if (_t21.length > 0) {
  const _t28: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t28.push((p) + ": 期望 object");
    else {
      const _t29 = v as Record<string, unknown>;
      if (_t29.type !== "checking") _t28.push(((p) + ".type") + ": 期望 checking");
    }
  const _t30 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "checking" ? 1 : 0)) : 0);
  if (_t28.length > 0) {
  const _t31: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t31.push((p) + ": 期望 object");
    else {
      const _t32 = v as Record<string, unknown>;
      if (_t32.type !== "available") _t31.push(((p) + ".type") + ": 期望 available");
      chkUpdateInfo(_t32.update, ((p) + ".update"), _t31);
    }
  const _t33 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "available" ? 1 : 0)) : 0);
  if (_t31.length > 0) {
  const _t34: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t34.push((p) + ": 期望 object");
    else {
      const _t35 = v as Record<string, unknown>;
      if (_t35.type !== "downloading") _t34.push(((p) + ".type") + ": 期望 downloading");
      chkUpdateInfo(_t35.update, ((p) + ".update"), _t34);
      chkDownloadProgress(_t35.progress, ((p) + ".progress"), _t34);
    }
  const _t37 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "downloading" ? 1 : 0)) : 0);
  if (_t34.length > 0) {
  const _t38: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t38.push((p) + ": 期望 object");
    else {
      const _t39 = v as Record<string, unknown>;
      if (_t39.type !== "downloaded") _t38.push(((p) + ".type") + ": 期望 downloaded");
      chkUpdateInfo(_t39.update, ((p) + ".update"), _t38);
      if (_t39.warning !== undefined) {
      chkUpdateError(_t39.warning, ((p) + ".warning"), _t38);
      }
    }
  const _t40 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "downloaded" ? 1 : 0)) : 0);
  if (_t38.length > 0) {
  const _t41: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t41.push((p) + ": 期望 object");
    else {
      const _t42 = v as Record<string, unknown>;
      if (_t42.type !== "updating") _t41.push(((p) + ".type") + ": 期望 updating");
      chkUpdateInfo(_t42.update, ((p) + ".update"), _t41);
    }
  const _t43 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "updating" ? 1 : 0)) : 0);
  if (_t41.length > 0) {
  const _t44: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t44.push((p) + ": 期望 object");
    else {
      const _t45 = v as Record<string, unknown>;
      if (_t45.type !== "ready") _t44.push(((p) + ".type") + ": 期望 ready");
      chkUpdateInfo(_t45.update, ((p) + ".update"), _t44);
      if (_t45.warning !== undefined) {
      chkUpdateError(_t45.warning, ((p) + ".warning"), _t44);
      }
    }
  const _t46 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "ready" ? 1 : 0)) : 0);
  const _t47 = [{ e: _t15, s: _t17 }, { e: _t18, s: _t20 }, { e: _t21, s: _t27 }, { e: _t28, s: _t30 }, { e: _t31, s: _t33 }, { e: _t34, s: _t37 }, { e: _t38, s: _t40 }, { e: _t41, s: _t43 }, { e: _t44, s: _t46 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t47.length > 0) errs.push(..._t47);
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
    const _t48 = v as Record<string, unknown>;
    if (typeof _t48.portName !== "string") errs.push(((p) + ".portName") + ": 期望 string，实收 " + typeof _t48.portName);
    if (typeof _t48.text !== "string") errs.push(((p) + ".text") + ": 期望 string，实收 " + typeof _t48.text);
  }
}
function chkSerialStatsPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t49 = v as Record<string, unknown>;
    if (typeof _t49.portName !== "string") errs.push(((p) + ".portName") + ": 期望 string，实收 " + typeof _t49.portName);
    if (_t49.tx !== undefined) {
    if (typeof _t49.tx !== "number") errs.push(((p) + ".tx") + ": 期望 number，实收 " + typeof _t49.tx);
    }
    if (_t49.rx !== undefined) {
    if (typeof _t49.rx !== "number") errs.push(((p) + ".rx") + ": 期望 number，实收 " + typeof _t49.rx);
    }
  }
}
function chkSerialSystemPayload(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t50 = v as Record<string, unknown>;
    if (typeof _t50.portName !== "string") errs.push(((p) + ".portName") + ": 期望 string，实收 " + typeof _t50.portName);
    if (typeof _t50.message !== "string") errs.push(((p) + ".message") + ": 期望 string，实收 " + typeof _t50.message);
    if (!(_t50.type === "status" || _t50.type === "error")) errs.push(((p) + ".type") + ": 期望 status|error");
  }
}
function chkPoolMenuItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t56 = v as Record<string, unknown>;
    if (typeof _t56.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t56.label);
    if (typeof _t56.command !== "string") errs.push(((p) + ".command") + ": 期望 string，实收 " + typeof _t56.command);
    if (_t56.group !== undefined) {
    if (typeof _t56.group !== "string") errs.push(((p) + ".group") + ": 期望 string，实收 " + typeof _t56.group);
    }
    if (_t56.shortcut !== undefined) {
    if (typeof _t56.shortcut !== "string") errs.push(((p) + ".shortcut") + ": 期望 string，实收 " + typeof _t56.shortcut);
    }
    if (_t56.checked !== undefined) {
    if (!(_t56.checked === false || _t56.checked === true)) errs.push(((p) + ".checked") + ": 期望 false|true");
    }
    if (_t56.children !== undefined) {
    if (!Array.isArray(_t56.children)) errs.push(((p) + ".children") + ": 期望数组");
    else {
      for (let _t57 = 0; _t57 < _t56.children.length; _t57++) {
          chkPoolMenuItem(_t56.children[_t57], (((p) + ".children") + "[" + _t57 + "]"), errs);
      }
    }
    }
  }
}
function chkPoolMenuGroup(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t54 = v as Record<string, unknown>;
    if (typeof _t54.group !== "string") errs.push(((p) + ".group") + ": 期望 string，实收 " + typeof _t54.group);
    if (typeof _t54.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t54.label);
    if (!Array.isArray(_t54.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t55 = 0; _t55 < _t54.items.length; _t55++) {
          chkPoolMenuItem(_t54.items[_t55], (((p) + ".items") + "[" + _t55 + "]"), errs);
      }
    }
  }
}
function chkTitleBarSlotButton(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t60 = v as Record<string, unknown>;
    if (typeof _t60.command !== "string") errs.push(((p) + ".command") + ": 期望 string，实收 " + typeof _t60.command);
    if (_t60.icon !== undefined) {
    if (typeof _t60.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t60.icon);
    }
    if (typeof _t60.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t60.title);
    if (_t60.label !== undefined) {
    if (typeof _t60.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t60.label);
    }
  }
}
function chkTitleBarLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t52 = v as Record<string, unknown>;
    if (typeof _t52.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t52.title);
    if (typeof _t52.logoUrl !== "string") errs.push(((p) + ".logoUrl") + ": 期望 string，实收 " + typeof _t52.logoUrl);
    if (!(_t52.menuBarVisible === false || _t52.menuBarVisible === true)) errs.push(((p) + ".menuBarVisible") + ": 期望 false|true");
    if (!Array.isArray(_t52.menuGroups)) errs.push(((p) + ".menuGroups") + ": 期望数组");
    else {
      for (let _t53 = 0; _t53 < _t52.menuGroups.length; _t53++) {
          chkPoolMenuGroup(_t52.menuGroups[_t53], (((p) + ".menuGroups") + "[" + _t53 + "]"), errs);
      }
    }
    if (_t52.slots === null || typeof _t52.slots !== "object" || Array.isArray(_t52.slots)) errs.push(((p) + ".slots") + ": 期望 object");
    else {
      const _t58 = _t52.slots as Record<string, unknown>;
      if (!Array.isArray(_t58.left)) errs.push((((p) + ".slots") + ".left") + ": 期望数组");
      else {
        for (let _t59 = 0; _t59 < _t58.left.length; _t59++) {
            chkTitleBarSlotButton(_t58.left[_t59], ((((p) + ".slots") + ".left") + "[" + _t59 + "]"), errs);
        }
      }
      if (!Array.isArray(_t58.right)) errs.push((((p) + ".slots") + ".right") + ": 期望数组");
      else {
        for (let _t61 = 0; _t61 < _t58.right.length; _t61++) {
            chkTitleBarSlotButton(_t58.right[_t61], ((((p) + ".slots") + ".right") + "[" + _t61 + "]"), errs);
        }
      }
    }
    if (_t52.windowControls === null || typeof _t52.windowControls !== "object" || Array.isArray(_t52.windowControls)) errs.push(((p) + ".windowControls") + ": 期望 object");
    else {
      const _t62 = _t52.windowControls as Record<string, unknown>;
      if (typeof _t62.minimize !== "string") errs.push((((p) + ".windowControls") + ".minimize") + ": 期望 string，实收 " + typeof _t62.minimize);
      if (typeof _t62.maximize !== "string") errs.push((((p) + ".windowControls") + ".maximize") + ": 期望 string，实收 " + typeof _t62.maximize);
      if (typeof _t62.restore !== "string") errs.push((((p) + ".windowControls") + ".restore") + ": 期望 string，实收 " + typeof _t62.restore);
      if (typeof _t62.close !== "string") errs.push((((p) + ".windowControls") + ".close") + ": 期望 string，实收 " + typeof _t62.close);
      if (typeof _t62.pin !== "string") errs.push((((p) + ".windowControls") + ".pin") + ": 期望 string，实收 " + typeof _t62.pin);
      if (typeof _t62.unpin !== "string") errs.push((((p) + ".windowControls") + ".unpin") + ": 期望 string，实收 " + typeof _t62.unpin);
    }
  }
}
function chkIconBarIcon(v: unknown, p: string, errs: string[]): void {
  const _t66: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t66.push((p) + ": 期望 object");
    else {
      const _t67 = v as Record<string, unknown>;
      if (_t67.kind !== "lucide") _t66.push(((p) + ".kind") + ": 期望 lucide");
      if (typeof _t67.name !== "string") _t66.push(((p) + ".name") + ": 期望 string，实收 " + typeof _t67.name);
    }
  const _t68 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).kind === "lucide" ? 1 : 0)) : 0);
  if (_t66.length > 0) {
  const _t69: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t69.push((p) + ": 期望 object");
    else {
      const _t70 = v as Record<string, unknown>;
      if (_t70.kind !== "codicon") _t69.push(((p) + ".kind") + ": 期望 codicon");
      if (typeof _t70.name !== "string") _t69.push(((p) + ".name") + ": 期望 string，实收 " + typeof _t70.name);
      if (_t70.color !== undefined) {
      if (typeof _t70.color !== "string") _t69.push(((p) + ".color") + ": 期望 string，实收 " + typeof _t70.color);
      }
    }
  const _t71 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).kind === "codicon" ? 1 : 0)) : 0);
  if (_t69.length > 0) {
  const _t72: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t72.push((p) + ": 期望 object");
    else {
      const _t73 = v as Record<string, unknown>;
      if (_t73.kind !== "img") _t72.push(((p) + ".kind") + ": 期望 img");
      if (typeof _t73.src !== "string") _t72.push(((p) + ".src") + ": 期望 string，实收 " + typeof _t73.src);
    }
  const _t74 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).kind === "img" ? 1 : 0)) : 0);
  if (_t72.length > 0) {
  const _t75: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t75.push((p) + ": 期望 object");
    else {
      const _t76 = v as Record<string, unknown>;
      if (_t76.kind !== "emoji") _t75.push(((p) + ".kind") + ": 期望 emoji");
      if (typeof _t76.text !== "string") _t75.push(((p) + ".text") + ": 期望 string，实收 " + typeof _t76.text);
    }
  const _t77 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).kind === "emoji" ? 1 : 0)) : 0);
  const _t78 = [{ e: _t66, s: _t68 }, { e: _t69, s: _t71 }, { e: _t72, s: _t74 }, { e: _t75, s: _t77 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t78.length > 0) errs.push(..._t78);
  }
  }
  }
}
function chkIconBarItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t65 = v as Record<string, unknown>;
    if (typeof _t65.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t65.pluginId);
    chkIconBarIcon(_t65.icon, ((p) + ".icon"), errs);
    if (typeof _t65.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t65.label);
    if (!(_t65.location === "top" || _t65.location === "bottom")) errs.push(((p) + ".location") + ": 期望 top|bottom");
  }
}
function chkIconBarLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t63 = v as Record<string, unknown>;
    if (!Array.isArray(_t63.icons)) errs.push(((p) + ".icons") + ": 期望数组");
    else {
      for (let _t64 = 0; _t64 < _t63.icons.length; _t64++) {
          chkIconBarItem(_t63.icons[_t64], (((p) + ".icons") + "[" + _t64 + "]"), errs);
      }
    }
    if (_t63.activePluginId !== undefined) {
    if (typeof _t63.activePluginId !== "string") errs.push(((p) + ".activePluginId") + ": 期望 string，实收 " + typeof _t63.activePluginId);
    }
    if (!(_t63.hamburgerVisible === false || _t63.hamburgerVisible === true)) errs.push(((p) + ".hamburgerVisible") + ": 期望 false|true");
    if (typeof _t63.navLabel !== "string") errs.push(((p) + ".navLabel") + ": 期望 string，实收 " + typeof _t63.navLabel);
    if (_t63.hamburger !== undefined) {
    if (_t63.hamburger === null || typeof _t63.hamburger !== "object" || Array.isArray(_t63.hamburger)) errs.push(((p) + ".hamburger") + ": 期望 object");
    else {
      const _t79 = _t63.hamburger as Record<string, unknown>;
      if (typeof _t79.title !== "string") errs.push((((p) + ".hamburger") + ".title") + ": 期望 string，实收 " + typeof _t79.title);
      if (!Array.isArray(_t79.groups)) errs.push((((p) + ".hamburger") + ".groups") + ": 期望数组");
      else {
        for (let _t80 = 0; _t80 < _t79.groups.length; _t80++) {
            chkPoolMenuGroup(_t79.groups[_t80], ((((p) + ".hamburger") + ".groups") + "[" + _t80 + "]"), errs);
        }
      }
    }
    }
  }
}
function chkTitleActionItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t91 = v as Record<string, unknown>;
    if (typeof _t91.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t91.label);
    if (typeof _t91.command !== "string") errs.push(((p) + ".command") + ": 期望 string，实收 " + typeof _t91.command);
    if (_t91.args !== undefined) {
    }
  }
}
function chkTitleActionWidget(v: unknown, p: string, errs: string[]): void {
  const _t85: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t85.push((p) + ": 期望 object");
    else {
      const _t86 = v as Record<string, unknown>;
      if (_t86.type !== "icon") _t85.push(((p) + ".type") + ": 期望 icon");
      if (typeof _t86.id !== "string") _t85.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t86.id);
      if (typeof _t86.command !== "string") _t85.push(((p) + ".command") + ": 期望 string，实收 " + typeof _t86.command);
      if (typeof _t86.icon !== "string") _t85.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t86.icon);
      if (typeof _t86.title !== "string") _t85.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t86.title);
      if (_t86.args !== undefined) {
      }
    }
  const _t87 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "icon" ? 1 : 0)) : 0);
  if (_t85.length > 0) {
  const _t88: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t88.push((p) + ": 期望 object");
    else {
      const _t89 = v as Record<string, unknown>;
      if (_t89.type !== "dropdown") _t88.push(((p) + ".type") + ": 期望 dropdown");
      if (typeof _t89.id !== "string") _t88.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t89.id);
      if (!Array.isArray(_t89.items)) _t88.push(((p) + ".items") + ": 期望数组");
      else {
        for (let _t90 = 0; _t90 < _t89.items.length; _t90++) {
            chkTitleActionItem(_t89.items[_t90], (((p) + ".items") + "[" + _t90 + "]"), _t88);
        }
      }
      if (_t89.title !== undefined) {
      if (typeof _t89.title !== "string") _t88.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t89.title);
      }
    }
  const _t92 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "dropdown" ? 1 : 0)) : 0);
  if (_t88.length > 0) {
  const _t93: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t93.push((p) + ": 期望 object");
    else {
      const _t94 = v as Record<string, unknown>;
      if (_t94.type !== "split") _t93.push(((p) + ".type") + ": 期望 split");
      if (typeof _t94.id !== "string") _t93.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t94.id);
      if (typeof _t94.command !== "string") _t93.push(((p) + ".command") + ": 期望 string，实收 " + typeof _t94.command);
      if (_t94.icon !== undefined) {
      if (typeof _t94.icon !== "string") _t93.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t94.icon);
      }
      if (typeof _t94.title !== "string") _t93.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t94.title);
      if (!Array.isArray(_t94.items)) _t93.push(((p) + ".items") + ": 期望数组");
      else {
        for (let _t95 = 0; _t95 < _t94.items.length; _t95++) {
            chkTitleActionItem(_t94.items[_t95], (((p) + ".items") + "[" + _t95 + "]"), _t93);
        }
      }
      if (_t94.args !== undefined) {
      }
    }
  const _t96 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "split" ? 1 : 0)) : 0);
  const _t97 = [{ e: _t85, s: _t87 }, { e: _t88, s: _t92 }, { e: _t93, s: _t96 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t97.length > 0) errs.push(..._t97);
  }
  }
}
function chkSidebarViewMeta(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t83 = v as Record<string, unknown>;
    if (typeof _t83.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t83.id);
    if (typeof _t83.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t83.title);
    if (typeof _t83.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t83.pluginId);
    if (typeof _t83.renderPath !== "string") errs.push(((p) + ".renderPath") + ": 期望 string，实收 " + typeof _t83.renderPath);
    if (_t83.role !== undefined) {
    if (!(_t83.role === "toolbar" || _t83.role === "section")) errs.push(((p) + ".role") + ": 期望 toolbar|section");
    }
    if (_t83.order !== undefined) {
    if (typeof _t83.order !== "number") errs.push(((p) + ".order") + ": 期望 number，实收 " + typeof _t83.order);
    }
    if (_t83.collapsed !== undefined) {
    if (!(_t83.collapsed === false || _t83.collapsed === true)) errs.push(((p) + ".collapsed") + ": 期望 false|true");
    }
    if (_t83.badge !== undefined) {
    if (!(typeof _t83.badge === "string" || typeof _t83.badge === "number")) errs.push(((p) + ".badge") + ": 期望 string|number");
    }
    if (_t83.titleDescription !== undefined) {
    if (typeof _t83.titleDescription !== "string") errs.push(((p) + ".titleDescription") + ": 期望 string，实收 " + typeof _t83.titleDescription);
    }
    if (_t83.titleTooltip !== undefined) {
    if (typeof _t83.titleTooltip !== "string") errs.push(((p) + ".titleTooltip") + ": 期望 string，实收 " + typeof _t83.titleTooltip);
    }
    if (_t83.singleViewPaneContainerTitle !== undefined) {
    if (typeof _t83.singleViewPaneContainerTitle !== "string") errs.push(((p) + ".singleViewPaneContainerTitle") + ": 期望 string，实收 " + typeof _t83.singleViewPaneContainerTitle);
    }
    if (_t83.minHeight !== undefined) {
    if (typeof _t83.minHeight !== "number") errs.push(((p) + ".minHeight") + ": 期望 number，实收 " + typeof _t83.minHeight);
    }
    if (_t83.titleActions !== undefined) {
    if (!Array.isArray(_t83.titleActions)) errs.push(((p) + ".titleActions") + ": 期望数组");
    else {
      for (let _t84 = 0; _t84 < _t83.titleActions.length; _t84++) {
          chkTitleActionWidget(_t83.titleActions[_t84], (((p) + ".titleActions") + "[" + _t84 + "]"), errs);
      }
    }
    }
  }
}
function chkSidebarContainerLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t99 = v as Record<string, unknown>;
    if (typeof _t99.containerId !== "string") errs.push(((p) + ".containerId") + ": 期望 string，实收 " + typeof _t99.containerId);
    if (typeof _t99.containerTitle !== "string") errs.push(((p) + ".containerTitle") + ": 期望 string，实收 " + typeof _t99.containerTitle);
    if (_t99.mergeHeaderWhenSingle !== undefined) {
    if (!(_t99.mergeHeaderWhenSingle === false || _t99.mergeHeaderWhenSingle === true)) errs.push(((p) + ".mergeHeaderWhenSingle") + ": 期望 false|true");
    }
    if (!Array.isArray(_t99.views)) errs.push(((p) + ".views") + ": 期望数组");
    else {
      for (let _t100 = 0; _t100 < _t99.views.length; _t100++) {
          chkSidebarViewMeta(_t99.views[_t100], (((p) + ".views") + "[" + _t100 + "]"), errs);
      }
    }
  }
}
function chkSidebarLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t81 = v as Record<string, unknown>;
    if (!(_t81.visible === false || _t81.visible === true)) errs.push(((p) + ".visible") + ": 期望 false|true");
    if (typeof _t81.width !== "number") errs.push(((p) + ".width") + ": 期望 number，实收 " + typeof _t81.width);
    if (_t81.edge !== undefined) {
    if (!(_t81.edge === "left" || _t81.edge === "right")) errs.push(((p) + ".edge") + ": 期望 left|right");
    }
    if (!(_t81.containerId === null || typeof _t81.containerId === "string")) errs.push(((p) + ".containerId") + ": 期望 null|string");
    if (typeof _t81.containerTitle !== "string") errs.push(((p) + ".containerTitle") + ": 期望 string，实收 " + typeof _t81.containerTitle);
    if (_t81.mergeHeaderWhenSingle !== undefined) {
    if (!(_t81.mergeHeaderWhenSingle === false || _t81.mergeHeaderWhenSingle === true)) errs.push(((p) + ".mergeHeaderWhenSingle") + ": 期望 false|true");
    }
    if (!Array.isArray(_t81.views)) errs.push(((p) + ".views") + ": 期望数组");
    else {
      for (let _t82 = 0; _t82 < _t81.views.length; _t82++) {
          chkSidebarViewMeta(_t81.views[_t82], (((p) + ".views") + "[" + _t82 + "]"), errs);
      }
    }
    if (_t81.containers !== undefined) {
    if (!Array.isArray(_t81.containers)) errs.push(((p) + ".containers") + ": 期望数组");
    else {
      for (let _t98 = 0; _t98 < _t81.containers.length; _t98++) {
          chkSidebarContainerLayout(_t81.containers[_t98], (((p) + ".containers") + "[" + _t98 + "]"), errs);
      }
    }
    }
    if (_t81.collapsedViews !== undefined) {
    if (!Array.isArray(_t81.collapsedViews)) errs.push(((p) + ".collapsedViews") + ": 期望数组");
    else {
      for (let _t101 = 0; _t101 < _t81.collapsedViews.length; _t101++) {
          if (typeof _t81.collapsedViews[_t101] !== "string") errs.push((((p) + ".collapsedViews") + "[" + _t101 + "]") + ": 期望 string，实收 " + typeof _t81.collapsedViews[_t101]);
      }
    }
    }
    if (_t81.collapsed !== undefined) {
    if (!(_t81.collapsed === false || _t81.collapsed === true)) errs.push(((p) + ".collapsed") + ": 期望 false|true");
    }
    if (_t81.emptyText !== undefined) {
    if (typeof _t81.emptyText !== "string") errs.push(((p) + ".emptyText") + ": 期望 string，实收 " + typeof _t81.emptyText);
    }
    if (_t81.emptyHint !== undefined) {
    if (typeof _t81.emptyHint !== "string") errs.push(((p) + ".emptyHint") + ": 期望 string，实收 " + typeof _t81.emptyHint);
    }
    if (_t81.minWidth !== undefined) {
    if (typeof _t81.minWidth !== "number") errs.push(((p) + ".minWidth") + ": 期望 number，实收 " + typeof _t81.minWidth);
    }
    if (_t81.maxWidth !== undefined) {
    if (typeof _t81.maxWidth !== "number") errs.push(((p) + ".maxWidth") + ": 期望 number，实收 " + typeof _t81.maxWidth);
    }
    if (_t81.viewId !== undefined) {
    if (!(_t81.viewId === null || typeof _t81.viewId === "string")) errs.push(((p) + ".viewId") + ": 期望 null|string");
    }
  }
}
function chkRightSidebarLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t102 = v as Record<string, unknown>;
    if (!(_t102.visible === false || _t102.visible === true)) errs.push(((p) + ".visible") + ": 期望 false|true");
    if (typeof _t102.width !== "number") errs.push(((p) + ".width") + ": 期望 number，实收 " + typeof _t102.width);
    if (!(_t102.containerId === null || typeof _t102.containerId === "string")) errs.push(((p) + ".containerId") + ": 期望 null|string");
    if (typeof _t102.containerTitle !== "string") errs.push(((p) + ".containerTitle") + ": 期望 string，实收 " + typeof _t102.containerTitle);
    if (_t102.mergeHeaderWhenSingle !== undefined) {
    if (!(_t102.mergeHeaderWhenSingle === false || _t102.mergeHeaderWhenSingle === true)) errs.push(((p) + ".mergeHeaderWhenSingle") + ": 期望 false|true");
    }
    if (!Array.isArray(_t102.views)) errs.push(((p) + ".views") + ": 期望数组");
    else {
      for (let _t103 = 0; _t103 < _t102.views.length; _t103++) {
          chkSidebarViewMeta(_t102.views[_t103], (((p) + ".views") + "[" + _t103 + "]"), errs);
      }
    }
    if (_t102.containers !== undefined) {
    if (!Array.isArray(_t102.containers)) errs.push(((p) + ".containers") + ": 期望数组");
    else {
      for (let _t104 = 0; _t104 < _t102.containers.length; _t104++) {
          chkSidebarContainerLayout(_t102.containers[_t104], (((p) + ".containers") + "[" + _t104 + "]"), errs);
      }
    }
    }
    if (_t102.collapsedViews !== undefined) {
    if (!Array.isArray(_t102.collapsedViews)) errs.push(((p) + ".collapsedViews") + ": 期望数组");
    else {
      for (let _t105 = 0; _t105 < _t102.collapsedViews.length; _t105++) {
          if (typeof _t102.collapsedViews[_t105] !== "string") errs.push((((p) + ".collapsedViews") + "[" + _t105 + "]") + ": 期望 string，实收 " + typeof _t102.collapsedViews[_t105]);
      }
    }
    }
    if (_t102.collapsed !== undefined) {
    if (!(_t102.collapsed === false || _t102.collapsed === true)) errs.push(((p) + ".collapsed") + ": 期望 false|true");
    }
    if (_t102.minWidth !== undefined) {
    if (typeof _t102.minWidth !== "number") errs.push(((p) + ".minWidth") + ": 期望 number，实收 " + typeof _t102.minWidth);
    }
    if (_t102.maxWidth !== undefined) {
    if (typeof _t102.maxWidth !== "number") errs.push(((p) + ".maxWidth") + ": 期望 number，实收 " + typeof _t102.maxWidth);
    }
    if (_t102.emptyText !== undefined) {
    if (typeof _t102.emptyText !== "string") errs.push(((p) + ".emptyText") + ": 期望 string，实收 " + typeof _t102.emptyText);
    }
    if (_t102.emptyHint !== undefined) {
    if (typeof _t102.emptyHint !== "string") errs.push(((p) + ".emptyHint") + ": 期望 string，实收 " + typeof _t102.emptyHint);
    }
  }
}
function chkPoolReleaseNotesHistoryItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t116 = v as Record<string, unknown>;
    if (typeof _t116.version !== "string") errs.push(((p) + ".version") + ": 期望 string，实收 " + typeof _t116.version);
    if (typeof _t116.dateLabel !== "string") errs.push(((p) + ".dateLabel") + ": 期望 string，实收 " + typeof _t116.dateLabel);
  }
}
function chkPoolReleaseNotesData(v: unknown, p: string, errs: string[]): void {
  const _t110: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t110.push((p) + ": 期望 object");
    else {
      const _t111 = v as Record<string, unknown>;
      if (_t111.state !== "loading") _t110.push(((p) + ".state") + ": 期望 loading");
    }
  const _t112 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).state === "loading" ? 1 : 0)) : 0);
  if (_t110.length > 0) {
  const _t113: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t113.push((p) + ": 期望 object");
    else {
      const _t114 = v as Record<string, unknown>;
      if (_t114.state !== "content") _t113.push(((p) + ".state") + ": 期望 content");
      if (typeof _t114.version !== "string") _t113.push(((p) + ".version") + ": 期望 string，实收 " + typeof _t114.version);
      if (typeof _t114.subtitle !== "string") _t113.push(((p) + ".subtitle") + ": 期望 string，实收 " + typeof _t114.subtitle);
      if (typeof _t114.channelLabel !== "string") _t113.push(((p) + ".channelLabel") + ": 期望 string，实收 " + typeof _t114.channelLabel);
      if (typeof _t114.body !== "string") _t113.push(((p) + ".body") + ": 期望 string，实收 " + typeof _t114.body);
      if (_t114.listUrl !== undefined) {
      if (typeof _t114.listUrl !== "string") _t113.push(((p) + ".listUrl") + ": 期望 string，实收 " + typeof _t114.listUrl);
      }
      if (!Array.isArray(_t114.historical)) _t113.push(((p) + ".historical") + ": 期望数组");
      else {
        for (let _t115 = 0; _t115 < _t114.historical.length; _t115++) {
            chkPoolReleaseNotesHistoryItem(_t114.historical[_t115], (((p) + ".historical") + "[" + _t115 + "]"), _t113);
        }
      }
      if (_t114.refreshing !== undefined) {
      if (!(_t114.refreshing === false || _t114.refreshing === true)) _t113.push(((p) + ".refreshing") + ": 期望 false|true");
      }
      if (_t114.refreshNote !== undefined) {
      if (typeof _t114.refreshNote !== "string") _t113.push(((p) + ".refreshNote") + ": 期望 string，实收 " + typeof _t114.refreshNote);
      }
      if (_t114.banner !== undefined) {
      if (typeof _t114.banner !== "string") _t113.push(((p) + ".banner") + ": 期望 string，实收 " + typeof _t114.banner);
      }
    }
  const _t117 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).state === "content" ? 1 : 0) + (((v as Record<string, unknown>).refreshing === false) || ((v as Record<string, unknown>).refreshing === true) ? 1 : 0)) : 0);
  if (_t113.length > 0) {
  const _t118: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t118.push((p) + ": 期望 object");
    else {
      const _t119 = v as Record<string, unknown>;
      if (_t119.state !== "empty") _t118.push(((p) + ".state") + ": 期望 empty");
      if (_t119.listUrl !== undefined) {
      if (typeof _t119.listUrl !== "string") _t118.push(((p) + ".listUrl") + ": 期望 string，实收 " + typeof _t119.listUrl);
      }
    }
  const _t120 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).state === "empty" ? 1 : 0)) : 0);
  const _t121 = [{ e: _t110, s: _t112 }, { e: _t113, s: _t117 }, { e: _t118, s: _t120 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t121.length > 0) errs.push(..._t121);
  }
  }
}
function chkPoolAboutField(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t130 = v as Record<string, unknown>;
    if (typeof _t130.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t130.label);
    if (typeof _t130.value !== "string") errs.push(((p) + ".value") + ": 期望 string，实收 " + typeof _t130.value);
    if (_t130.href !== undefined) {
    if (typeof _t130.href !== "string") errs.push(((p) + ".href") + ": 期望 string，实收 " + typeof _t130.href);
    }
    if (_t130.secondary !== undefined) {
    if (!(_t130.secondary === false || _t130.secondary === true)) errs.push(((p) + ".secondary") + ": 期望 false|true");
    }
  }
}
function chkPoolAboutCard(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t128 = v as Record<string, unknown>;
    if (typeof _t128.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t128.title);
    if (!Array.isArray(_t128.rows)) errs.push(((p) + ".rows") + ": 期望数组");
    else {
      for (let _t129 = 0; _t129 < _t128.rows.length; _t129++) {
          chkPoolAboutField(_t128.rows[_t129], (((p) + ".rows") + "[" + _t129 + "]"), errs);
      }
    }
  }
}
function chkPoolAboutData(v: unknown, p: string, errs: string[]): void {
  const _t122: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t122.push((p) + ": 期望 object");
    else {
      const _t123 = v as Record<string, unknown>;
      if (_t123.state !== "loading") _t122.push(((p) + ".state") + ": 期望 loading");
    }
  const _t124 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).state === "loading" ? 1 : 0)) : 0);
  if (_t122.length > 0) {
  const _t125: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t125.push((p) + ": 期望 object");
    else {
      const _t126 = v as Record<string, unknown>;
      if (_t126.state !== "content") _t125.push(((p) + ".state") + ": 期望 content");
      if (typeof _t126.name !== "string") _t125.push(((p) + ".name") + ": 期望 string，实收 " + typeof _t126.name);
      if (typeof _t126.logoUrl !== "string") _t125.push(((p) + ".logoUrl") + ": 期望 string，实收 " + typeof _t126.logoUrl);
      if (typeof _t126.version !== "string") _t125.push(((p) + ".version") + ": 期望 string，实收 " + typeof _t126.version);
      if (typeof _t126.tagline !== "string") _t125.push(((p) + ".tagline") + ": 期望 string，实收 " + typeof _t126.tagline);
      if (!Array.isArray(_t126.cards)) _t125.push(((p) + ".cards") + ": 期望数组");
      else {
        for (let _t127 = 0; _t127 < _t126.cards.length; _t127++) {
            chkPoolAboutCard(_t126.cards[_t127], (((p) + ".cards") + "[" + _t127 + "]"), _t125);
        }
      }
      if (_t126.footerCopyright !== undefined) {
      if (typeof _t126.footerCopyright !== "string") _t125.push(((p) + ".footerCopyright") + ": 期望 string，实收 " + typeof _t126.footerCopyright);
      }
      if (_t126.repoUrl !== undefined) {
      if (typeof _t126.repoUrl !== "string") _t125.push(((p) + ".repoUrl") + ": 期望 string，实收 " + typeof _t126.repoUrl);
      }
    }
  const _t131 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).state === "content" ? 1 : 0)) : 0);
  const _t132 = [{ e: _t122, s: _t124 }, { e: _t125, s: _t131 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t132.length > 0) errs.push(..._t132);
  }
}
function chkPoolTab(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t109 = v as Record<string, unknown>;
    if (typeof _t109.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t109.id);
    if (typeof _t109.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t109.pluginId);
    if (typeof _t109.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t109.title);
    if (_t109.sourceId !== undefined) {
    if (typeof _t109.sourceId !== "string") errs.push(((p) + ".sourceId") + ": 期望 string，实收 " + typeof _t109.sourceId);
    }
    if (_t109.hint !== undefined) {
    if (typeof _t109.hint !== "string") errs.push(((p) + ".hint") + ": 期望 string，实收 " + typeof _t109.hint);
    }
    if (_t109.dirty !== undefined) {
    if (!(_t109.dirty === false || _t109.dirty === true)) errs.push(((p) + ".dirty") + ": 期望 false|true");
    }
    if (_t109.icon !== undefined) {
    chkIconBarIcon(_t109.icon, ((p) + ".icon"), errs);
    }
    if (_t109.pinned !== undefined) {
    if (!(_t109.pinned === false || _t109.pinned === true)) errs.push(((p) + ".pinned") + ": 期望 false|true");
    }
    if (_t109.closeBehavior !== undefined) {
    if (!(_t109.closeBehavior === "normal" || _t109.closeBehavior === "confirm" || _t109.closeBehavior === "blocked")) errs.push(((p) + ".closeBehavior") + ": 期望 normal|confirm|blocked");
    }
    if (_t109.singleton !== undefined) {
    if (!(_t109.singleton === false || _t109.singleton === true)) errs.push(((p) + ".singleton") + ": 期望 false|true");
    }
    if (_t109.shellRendered !== undefined) {
    if (!(_t109.shellRendered === false || _t109.shellRendered === true)) errs.push(((p) + ".shellRendered") + ": 期望 false|true");
    }
    if (_t109.shellType !== undefined) {
    if (typeof _t109.shellType !== "string") errs.push(((p) + ".shellType") + ": 期望 string，实收 " + typeof _t109.shellType);
    }
    if (_t109.detailPluginId !== undefined) {
    if (typeof _t109.detailPluginId !== "string") errs.push(((p) + ".detailPluginId") + ": 期望 string，实收 " + typeof _t109.detailPluginId);
    }
    if (_t109.detailContributorId !== undefined) {
    if (typeof _t109.detailContributorId !== "string") errs.push(((p) + ".detailContributorId") + ": 期望 string，实收 " + typeof _t109.detailContributorId);
    }
    if (_t109.detailViewRenderPath !== undefined) {
    if (typeof _t109.detailViewRenderPath !== "string") errs.push(((p) + ".detailViewRenderPath") + ": 期望 string，实收 " + typeof _t109.detailViewRenderPath);
    }
    if (_t109.releaseNotes !== undefined) {
    chkPoolReleaseNotesData(_t109.releaseNotes, ((p) + ".releaseNotes"), errs);
    }
    if (_t109.about !== undefined) {
    chkPoolAboutData(_t109.about, ((p) + ".about"), errs);
    }
  }
}
function chkPoolGroup(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t107 = v as Record<string, unknown>;
    if (typeof _t107.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t107.id);
    if (typeof _t107.flex !== "number") errs.push(((p) + ".flex") + ": 期望 number，实收 " + typeof _t107.flex);
    if (typeof _t107.activeTabId !== "string") errs.push(((p) + ".activeTabId") + ": 期望 string，实收 " + typeof _t107.activeTabId);
    if (!Array.isArray(_t107.tabs)) errs.push(((p) + ".tabs") + ": 期望数组");
    else {
      for (let _t108 = 0; _t108 < _t107.tabs.length; _t108++) {
          chkPoolTab(_t107.tabs[_t108], (((p) + ".tabs") + "[" + _t108 + "]"), errs);
      }
    }
  }
}
function chkSplitNode(v: unknown, p: string, errs: string[]): void {
  const _t133: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t133.push((p) + ": 期望 object");
    else {
      const _t134 = v as Record<string, unknown>;
      if (_t134.type !== "leaf") _t133.push(((p) + ".type") + ": 期望 leaf");
      if (typeof _t134.groupId !== "string") _t133.push(((p) + ".groupId") + ": 期望 string，实收 " + typeof _t134.groupId);
    }
  const _t135 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "leaf" ? 1 : 0)) : 0);
  if (_t133.length > 0) {
  const _t136: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t136.push((p) + ": 期望 object");
    else {
      const _t137 = v as Record<string, unknown>;
      if (_t137.type !== "branch") _t136.push(((p) + ".type") + ": 期望 branch");
      if (!(_t137.direction === "horizontal" || _t137.direction === "vertical")) _t136.push(((p) + ".direction") + ": 期望 horizontal|vertical");
      if (!Array.isArray(_t137.children)) _t136.push(((p) + ".children") + ": 期望数组");
      else {
        if (_t137.children.length !== 2) _t136.push(((p) + ".children") + ": 期望长度 2");
          chkSplitNode(_t137.children[0], (((p) + ".children") + "[0]"), _t136);
          chkSplitNode(_t137.children[1], (((p) + ".children") + "[1]"), _t136);
      }
      if (!Array.isArray(_t137.sizes)) _t136.push(((p) + ".sizes") + ": 期望数组");
      else {
        if (_t137.sizes.length !== 2) _t136.push(((p) + ".sizes") + ": 期望长度 2");
          if (typeof _t137.sizes[0] !== "number") _t136.push((((p) + ".sizes") + "[0]") + ": 期望 number，实收 " + typeof _t137.sizes[0]);
          if (typeof _t137.sizes[1] !== "number") _t136.push((((p) + ".sizes") + "[1]") + ": 期望 number，实收 " + typeof _t137.sizes[1]);
      }
    }
  const _t138 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "branch" ? 1 : 0) + (((v as Record<string, unknown>).direction === "horizontal") || ((v as Record<string, unknown>).direction === "vertical") ? 1 : 0)) : 0);
  const _t139 = [{ e: _t133, s: _t135 }, { e: _t136, s: _t138 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t139.length > 0) errs.push(..._t139);
  }
}
function chkCreatableViewMeta(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t141 = v as Record<string, unknown>;
    if (typeof _t141.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t141.pluginId);
    if (typeof _t141.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t141.label);
  }
}
function chkPanelViewMeta(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t144 = v as Record<string, unknown>;
    if (typeof _t144.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t144.id);
    if (typeof _t144.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t144.title);
    if (typeof _t144.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t144.pluginId);
    if (typeof _t144.renderPath !== "string") errs.push(((p) + ".renderPath") + ": 期望 string，实收 " + typeof _t144.renderPath);
    if (_t144.titleActions !== undefined) {
    if (!Array.isArray(_t144.titleActions)) errs.push(((p) + ".titleActions") + ": 期望数组");
    else {
      for (let _t145 = 0; _t145 < _t144.titleActions.length; _t145++) {
          chkTitleActionWidget(_t144.titleActions[_t145], (((p) + ".titleActions") + "[" + _t145 + "]"), errs);
      }
    }
    }
  }
}
function chkPanelSwitcherItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t149 = v as Record<string, unknown>;
    if (typeof _t149.viewId !== "string") errs.push(((p) + ".viewId") + ": 期望 string，实收 " + typeof _t149.viewId);
    if (typeof _t149.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t149.title);
    if (typeof _t149.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t149.pluginId);
    if (!(_t149.visible === false || _t149.visible === true)) errs.push(((p) + ".visible") + ": 期望 false|true");
    if (!(_t149.active === false || _t149.active === true)) errs.push(((p) + ".active") + ": 期望 false|true");
  }
}
function chkPanelSwitcherGroup(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t147 = v as Record<string, unknown>;
    if (typeof _t147.containerId !== "string") errs.push(((p) + ".containerId") + ": 期望 string，实收 " + typeof _t147.containerId);
    if (typeof _t147.containerTitle !== "string") errs.push(((p) + ".containerTitle") + ": 期望 string，实收 " + typeof _t147.containerTitle);
    if (!Array.isArray(_t147.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t148 = 0; _t148 < _t147.items.length; _t148++) {
          chkPanelSwitcherItem(_t147.items[_t148], (((p) + ".items") + "[" + _t148 + "]"), errs);
      }
    }
  }
}
function chkPanelLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t142 = v as Record<string, unknown>;
    if (!(_t142.visible === false || _t142.visible === true)) errs.push(((p) + ".visible") + ": 期望 false|true");
    if (typeof _t142.height !== "number") errs.push(((p) + ".height") + ": 期望 number，实收 " + typeof _t142.height);
    if (_t142.edge !== undefined) {
    if (!(_t142.edge === "top" || _t142.edge === "bottom" || _t142.edge === "left" || _t142.edge === "right")) errs.push(((p) + ".edge") + ": 期望 top|bottom|left|right");
    }
    if (_t142.align !== undefined) {
    if (!(_t142.align === "left" || _t142.align === "right" || _t142.align === "center" || _t142.align === "justify")) errs.push(((p) + ".align") + ": 期望 left|right|center|justify");
    }
    if (_t142.width !== undefined) {
    if (typeof _t142.width !== "number") errs.push(((p) + ".width") + ": 期望 number，实收 " + typeof _t142.width);
    }
    if (typeof _t142.activeViewId !== "string") errs.push(((p) + ".activeViewId") + ": 期望 string，实收 " + typeof _t142.activeViewId);
    if (!Array.isArray(_t142.views)) errs.push(((p) + ".views") + ": 期望数组");
    else {
      for (let _t143 = 0; _t143 < _t142.views.length; _t143++) {
          chkPanelViewMeta(_t142.views[_t143], (((p) + ".views") + "[" + _t143 + "]"), errs);
      }
    }
    if (_t142.minHeight !== undefined) {
    if (typeof _t142.minHeight !== "number") errs.push(((p) + ".minHeight") + ": 期望 number，实收 " + typeof _t142.minHeight);
    }
    if (_t142.maxHeight !== undefined) {
    if (typeof _t142.maxHeight !== "number") errs.push(((p) + ".maxHeight") + ": 期望 number，实收 " + typeof _t142.maxHeight);
    }
    if (_t142.minWidth !== undefined) {
    if (typeof _t142.minWidth !== "number") errs.push(((p) + ".minWidth") + ": 期望 number，实收 " + typeof _t142.minWidth);
    }
    if (_t142.maxWidth !== undefined) {
    if (typeof _t142.maxWidth !== "number") errs.push(((p) + ".maxWidth") + ": 期望 number，实收 " + typeof _t142.maxWidth);
    }
    if (_t142.createTooltip !== undefined) {
    if (typeof _t142.createTooltip !== "string") errs.push(((p) + ".createTooltip") + ": 期望 string，实收 " + typeof _t142.createTooltip);
    }
    if (_t142.switcher !== undefined) {
    if (!Array.isArray(_t142.switcher)) errs.push(((p) + ".switcher") + ": 期望数组");
    else {
      for (let _t146 = 0; _t146 < _t142.switcher.length; _t146++) {
          chkPanelSwitcherGroup(_t142.switcher[_t146], (((p) + ".switcher") + "[" + _t146 + "]"), errs);
      }
    }
    }
    if (_t142.emptyText !== undefined) {
    if (typeof _t142.emptyText !== "string") errs.push(((p) + ".emptyText") + ": 期望 string，实收 " + typeof _t142.emptyText);
    }
    if (_t142.emptyHint !== undefined) {
    if (typeof _t142.emptyHint !== "string") errs.push(((p) + ".emptyHint") + ": 期望 string，实收 " + typeof _t142.emptyHint);
    }
    if (_t142.detachable !== undefined) {
    if (!(_t142.detachable === false || _t142.detachable === true)) errs.push(((p) + ".detachable") + ": 期望 false|true");
    }
    if (_t142.detachTooltip !== undefined) {
    if (typeof _t142.detachTooltip !== "string") errs.push(((p) + ".detachTooltip") + ": 期望 string，实收 " + typeof _t142.detachTooltip);
    }
  }
}
function chkPoolStatusBarItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t152 = v as Record<string, unknown>;
    if (typeof _t152.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t152.id);
    if (typeof _t152.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t152.pluginId);
    if (_t152.icon !== undefined) {
    if (typeof _t152.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t152.icon);
    }
    if (typeof _t152.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t152.label);
    if (_t152.title !== undefined) {
    if (typeof _t152.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t152.title);
    }
    if (!(_t152.align === "left" || _t152.align === "right")) errs.push(((p) + ".align") + ": 期望 left|right");
    if (_t152.onClick !== undefined) {
    if (typeof _t152.onClick !== "string") errs.push(((p) + ".onClick") + ": 期望 string，实收 " + typeof _t152.onClick);
    }
    if (_t152.componentRenderPath !== undefined) {
    if (typeof _t152.componentRenderPath !== "string") errs.push(((p) + ".componentRenderPath") + ": 期望 string，实收 " + typeof _t152.componentRenderPath);
    }
    if (_t152.dividerBefore !== undefined) {
    if (!(_t152.dividerBefore === false || _t152.dividerBefore === true)) errs.push(((p) + ".dividerBefore") + ": 期望 false|true");
    }
  }
}
function chkNotifJobRow(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t157 = v as Record<string, unknown>;
    if (typeof _t157.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t157.id);
    if (typeof _t157.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t157.pluginId);
    if (typeof _t157.name !== "string") errs.push(((p) + ".name") + ": 期望 string，实收 " + typeof _t157.name);
    if (typeof _t157.iconClass !== "string") errs.push(((p) + ".iconClass") + ": 期望 string，实收 " + typeof _t157.iconClass);
    if (typeof _t157.statusLabel !== "string") errs.push(((p) + ".statusLabel") + ": 期望 string，实收 " + typeof _t157.statusLabel);
    if (_t157.percent !== undefined) {
    if (typeof _t157.percent !== "number") errs.push(((p) + ".percent") + ": 期望 number，实收 " + typeof _t157.percent);
    }
    if (_t157.cancellable !== undefined) {
    if (!(_t157.cancellable === false || _t157.cancellable === true)) errs.push(((p) + ".cancellable") + ": 期望 false|true");
    }
    if (_t157.cancelLabel !== undefined) {
    if (typeof _t157.cancelLabel !== "string") errs.push(((p) + ".cancelLabel") + ": 期望 string，实收 " + typeof _t157.cancelLabel);
    }
  }
}
function chkNotifSection(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t155 = v as Record<string, unknown>;
    if (typeof _t155.key !== "string") errs.push(((p) + ".key") + ": 期望 string，实收 " + typeof _t155.key);
    if (typeof _t155.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t155.label);
    if (!Array.isArray(_t155.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t156 = 0; _t156 < _t155.items.length; _t156++) {
          chkNotifJobRow(_t155.items[_t156], (((p) + ".items") + "[" + _t156 + "]"), errs);
      }
    }
    if (_t155.foldedLabel !== undefined) {
    if (typeof _t155.foldedLabel !== "string") errs.push(((p) + ".foldedLabel") + ": 期望 string，实收 " + typeof _t155.foldedLabel);
    }
  }
}
function chkNotifAction(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t163 = v as Record<string, unknown>;
    if (typeof _t163.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t163.label);
    if (_t163.isPrimary !== undefined) {
    if (!(_t163.isPrimary === false || _t163.isPrimary === true)) errs.push(((p) + ".isPrimary") + ": 期望 false|true");
    }
    if (_t163.command !== undefined) {
    if (typeof _t163.command !== "string") errs.push(((p) + ".command") + ": 期望 string，实收 " + typeof _t163.command);
    }
    if (_t163.args !== undefined) {
    if (!Array.isArray(_t163.args)) errs.push(((p) + ".args") + ": 期望数组");
    else {
      for (let _t164 = 0; _t164 < _t163.args.length; _t164++) {
      }
    }
    }
  }
}
function chkNotifItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t161 = v as Record<string, unknown>;
    if (typeof _t161.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t161.id);
    if (typeof _t161.iconClass !== "string") errs.push(((p) + ".iconClass") + ": 期望 string，实收 " + typeof _t161.iconClass);
    if (typeof _t161.message !== "string") errs.push(((p) + ".message") + ": 期望 string，实收 " + typeof _t161.message);
    if (typeof _t161.timeLabel !== "string") errs.push(((p) + ".timeLabel") + ": 期望 string，实收 " + typeof _t161.timeLabel);
    if (_t161.sourceLabel !== undefined) {
    if (typeof _t161.sourceLabel !== "string") errs.push(((p) + ".sourceLabel") + ": 期望 string，实收 " + typeof _t161.sourceLabel);
    }
    if (!Array.isArray(_t161.actions)) errs.push(((p) + ".actions") + ": 期望数组");
    else {
      for (let _t162 = 0; _t162 < _t161.actions.length; _t162++) {
          chkNotifAction(_t161.actions[_t162], (((p) + ".actions") + "[" + _t162 + "]"), errs);
      }
    }
    if (_t161.progress !== undefined) {
    if (!(_t161.progress === false || _t161.progress === true)) errs.push(((p) + ".progress") + ": 期望 false|true");
    }
    if (_t161.percent !== undefined) {
    if (typeof _t161.percent !== "number") errs.push(((p) + ".percent") + ": 期望 number，实收 " + typeof _t161.percent);
    }
    if (!(_t161.wake === false || _t161.wake === true)) errs.push(((p) + ".wake") + ": 期望 false|true");
    if (_t161.ttl !== undefined) {
    if (typeof _t161.ttl !== "number") errs.push(((p) + ".ttl") + ": 期望 number，实收 " + typeof _t161.ttl);
    }
    if (_t161.persistent !== undefined) {
    if (!(_t161.persistent === false || _t161.persistent === true)) errs.push(((p) + ".persistent") + ": 期望 false|true");
    }
  }
}
function chkNotifGroup(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t159 = v as Record<string, unknown>;
    if (typeof _t159.key !== "string") errs.push(((p) + ".key") + ": 期望 string，实收 " + typeof _t159.key);
    if (typeof _t159.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t159.label);
    if (typeof _t159.unread !== "number") errs.push(((p) + ".unread") + ": 期望 number，实收 " + typeof _t159.unread);
    if (!Array.isArray(_t159.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t160 = 0; _t160 < _t159.items.length; _t160++) {
          chkNotifItem(_t159.items[_t160], (((p) + ".items") + "[" + _t160 + "]"), errs);
      }
    }
    if (_t159.foldedLabel !== undefined) {
    if (typeof _t159.foldedLabel !== "string") errs.push(((p) + ".foldedLabel") + ": 期望 string，实收 " + typeof _t159.foldedLabel);
    }
  }
}
function chkNotifLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t153 = v as Record<string, unknown>;
    if (typeof _t153.unread !== "number") errs.push(((p) + ".unread") + ": 期望 number，实收 " + typeof _t153.unread);
    if (typeof _t153.bellTitle !== "string") errs.push(((p) + ".bellTitle") + ": 期望 string，实收 " + typeof _t153.bellTitle);
    if (typeof _t153.panelTitle !== "string") errs.push(((p) + ".panelTitle") + ": 期望 string，实收 " + typeof _t153.panelTitle);
    if (typeof _t153.clearLabel !== "string") errs.push(((p) + ".clearLabel") + ": 期望 string，实收 " + typeof _t153.clearLabel);
    if (typeof _t153.minimizeLabel !== "string") errs.push(((p) + ".minimizeLabel") + ": 期望 string，实收 " + typeof _t153.minimizeLabel);
    if (typeof _t153.emptyLabel !== "string") errs.push(((p) + ".emptyLabel") + ": 期望 string，实收 " + typeof _t153.emptyLabel);
    if (typeof _t153.dismissTitle !== "string") errs.push(((p) + ".dismissTitle") + ": 期望 string，实收 " + typeof _t153.dismissTitle);
    if (_t153.summaryLabel !== undefined) {
    if (typeof _t153.summaryLabel !== "string") errs.push(((p) + ".summaryLabel") + ": 期望 string，实收 " + typeof _t153.summaryLabel);
    }
    if (_t153.sections !== undefined) {
    if (!Array.isArray(_t153.sections)) errs.push(((p) + ".sections") + ": 期望数组");
    else {
      for (let _t154 = 0; _t154 < _t153.sections.length; _t154++) {
          chkNotifSection(_t153.sections[_t154], (((p) + ".sections") + "[" + _t154 + "]"), errs);
      }
    }
    }
    if (_t153.resultLabel !== undefined) {
    if (typeof _t153.resultLabel !== "string") errs.push(((p) + ".resultLabel") + ": 期望 string，实收 " + typeof _t153.resultLabel);
    }
    if (_t153.resultSummary !== undefined) {
    if (typeof _t153.resultSummary !== "string") errs.push(((p) + ".resultSummary") + ": 期望 string，实收 " + typeof _t153.resultSummary);
    }
    if (!Array.isArray(_t153.groups)) errs.push(((p) + ".groups") + ": 期望数组");
    else {
      for (let _t158 = 0; _t158 < _t153.groups.length; _t158++) {
          chkNotifGroup(_t153.groups[_t158], (((p) + ".groups") + "[" + _t158 + "]"), errs);
      }
    }
    if (_t153.autoOpen !== undefined) {
    if (!(_t153.autoOpen === false || _t153.autoOpen === true)) errs.push(((p) + ".autoOpen") + ": 期望 false|true");
    }
  }
}
function chkStatusBarLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t150 = v as Record<string, unknown>;
    if (!Array.isArray(_t150.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t151 = 0; _t151 < _t150.items.length; _t151++) {
          chkPoolStatusBarItem(_t150.items[_t151], (((p) + ".items") + "[" + _t151 + "]"), errs);
      }
    }
    if (_t150.chordLabel !== undefined) {
    if (typeof _t150.chordLabel !== "string") errs.push(((p) + ".chordLabel") + ": 期望 string，实收 " + typeof _t150.chordLabel);
    }
    chkNotifLayout(_t150.notif, ((p) + ".notif"), errs);
  }
}
function chkPoolCommandHints(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t165 = v as Record<string, unknown>;
    for (const _t166 of Object.keys(_t165)) {
    if (_t165[_t166] === null || typeof _t165[_t166] !== "object" || Array.isArray(_t165[_t166])) errs.push(((p) + "[\"" + _t166 + "\"]") + ": 期望 object");
    else {
      const _t167 = _t165[_t166] as Record<string, unknown>;
      if (typeof _t167.title !== "string") errs.push((((p) + "[\"" + _t166 + "\"]") + ".title") + ": 期望 string，实收 " + typeof _t167.title);
      if (_t167.keybinding !== undefined) {
      if (typeof _t167.keybinding !== "string") errs.push((((p) + "[\"" + _t166 + "\"]") + ".keybinding") + ": 期望 string，实收 " + typeof _t167.keybinding);
      }
    }
    }
  }
}
function chkPoolLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t51 = v as Record<string, unknown>;
    if (_t51.version !== 2) errs.push(((p) + ".version") + ": 期望 2");
    chkTitleBarLayout(_t51.titleBar, ((p) + ".titleBar"), errs);
    if (_t51.iconBar !== undefined) {
    chkIconBarLayout(_t51.iconBar, ((p) + ".iconBar"), errs);
    }
    if (_t51.sidebar !== undefined) {
    chkSidebarLayout(_t51.sidebar, ((p) + ".sidebar"), errs);
    }
    if (_t51.rightSidebar !== undefined) {
    chkRightSidebarLayout(_t51.rightSidebar, ((p) + ".rightSidebar"), errs);
    }
    if (!Array.isArray(_t51.groups)) errs.push(((p) + ".groups") + ": 期望数组");
    else {
      for (let _t106 = 0; _t106 < _t51.groups.length; _t106++) {
          chkPoolGroup(_t51.groups[_t106], (((p) + ".groups") + "[" + _t106 + "]"), errs);
      }
    }
    if (_t51.activeGroupId !== undefined) {
    if (typeof _t51.activeGroupId !== "string") errs.push(((p) + ".activeGroupId") + ": 期望 string，实收 " + typeof _t51.activeGroupId);
    }
    if (_t51.root !== undefined) {
    chkSplitNode(_t51.root, ((p) + ".root"), errs);
    }
    if (_t51.creatableViews !== undefined) {
    if (!Array.isArray(_t51.creatableViews)) errs.push(((p) + ".creatableViews") + ": 期望数组");
    else {
      for (let _t140 = 0; _t140 < _t51.creatableViews.length; _t140++) {
          chkCreatableViewMeta(_t51.creatableViews[_t140], (((p) + ".creatableViews") + "[" + _t140 + "]"), errs);
      }
    }
    }
    if (_t51.panel !== undefined) {
    chkPanelLayout(_t51.panel, ((p) + ".panel"), errs);
    }
    if (_t51.statusBar !== undefined) {
    chkStatusBarLayout(_t51.statusBar, ((p) + ".statusBar"), errs);
    }
    if (_t51.hintEnabled !== undefined) {
    if (!(_t51.hintEnabled === false || _t51.hintEnabled === true)) errs.push(((p) + ".hintEnabled") + ": 期望 false|true");
    }
    if (_t51.commands !== undefined) {
    chkPoolCommandHints(_t51.commands, ((p) + ".commands"), errs);
    }
  }
}
function chkPoolQuickPickButton(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t172 = v as Record<string, unknown>;
    if (typeof _t172.actionId !== "string") errs.push(((p) + ".actionId") + ": 期望 string，实收 " + typeof _t172.actionId);
    if (typeof _t172.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t172.icon);
    if (_t172.tooltip !== undefined) {
    if (typeof _t172.tooltip !== "string") errs.push(((p) + ".tooltip") + ": 期望 string，实收 " + typeof _t172.tooltip);
    }
  }
}
function chkPoolQuickPickItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t170 = v as Record<string, unknown>;
    if (typeof _t170.key !== "string") errs.push(((p) + ".key") + ": 期望 string，实收 " + typeof _t170.key);
    if (typeof _t170.searchText !== "string") errs.push(((p) + ".searchText") + ": 期望 string，实收 " + typeof _t170.searchText);
    if (_t170.checked !== undefined) {
    if (!(_t170.checked === false || _t170.checked === true)) errs.push(((p) + ".checked") + ": 期望 false|true");
    }
    if (typeof _t170.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t170.label);
    if (_t170.category !== undefined) {
    if (typeof _t170.category !== "string") errs.push(((p) + ".category") + ": 期望 string，实收 " + typeof _t170.category);
    }
    if (_t170.detail !== undefined) {
    if (typeof _t170.detail !== "string") errs.push(((p) + ".detail") + ": 期望 string，实收 " + typeof _t170.detail);
    }
    if (_t170.keybinding !== undefined) {
    if (typeof _t170.keybinding !== "string") errs.push(((p) + ".keybinding") + ": 期望 string，实收 " + typeof _t170.keybinding);
    }
    if (_t170.buttons !== undefined) {
    if (!Array.isArray(_t170.buttons)) errs.push(((p) + ".buttons") + ": 期望数组");
    else {
      for (let _t171 = 0; _t171 < _t170.buttons.length; _t171++) {
          chkPoolQuickPickButton(_t170.buttons[_t171], (((p) + ".buttons") + "[" + _t171 + "]"), errs);
      }
    }
    }
  }
}
function chkPoolQuickPickData(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t168 = v as Record<string, unknown>;
    if (!(_t168.open === false || _t168.open === true)) errs.push(((p) + ".open") + ": 期望 false|true");
    if (typeof _t168.placeholder !== "string") errs.push(((p) + ".placeholder") + ": 期望 string，实收 " + typeof _t168.placeholder);
    if (_t168.prefix !== undefined) {
    if (typeof _t168.prefix !== "string") errs.push(((p) + ".prefix") + ": 期望 string，实收 " + typeof _t168.prefix);
    }
    if (!Array.isArray(_t168.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t169 = 0; _t169 < _t168.items.length; _t169++) {
          chkPoolQuickPickItem(_t168.items[_t169], (((p) + ".items") + "[" + _t169 + "]"), errs);
      }
    }
  }
}
function chkPoolDialogData(v: unknown, p: string, errs: string[]): void {
  const _t173: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t173.push((p) + ": 期望 object");
    else {
      const _t174 = v as Record<string, unknown>;
      if (_t174.open !== false) _t173.push(((p) + ".open") + ": 期望 false");
    }
  const _t175 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).open === false ? 1 : 0)) : 0);
  if (_t173.length > 0) {
  const _t176: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t176.push((p) + ": 期望 object");
    else {
      const _t177 = v as Record<string, unknown>;
      if (_t177.open !== true) _t176.push(((p) + ".open") + ": 期望 true");
      if (typeof _t177.title !== "string") _t176.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t177.title);
      if (typeof _t177.message !== "string") _t176.push(((p) + ".message") + ": 期望 string，实收 " + typeof _t177.message);
      if (_t177.confirmLabel !== undefined) {
      if (typeof _t177.confirmLabel !== "string") _t176.push(((p) + ".confirmLabel") + ": 期望 string，实收 " + typeof _t177.confirmLabel);
      }
      if (_t177.cancelLabel !== undefined) {
      if (typeof _t177.cancelLabel !== "string") _t176.push(((p) + ".cancelLabel") + ": 期望 string，实收 " + typeof _t177.cancelLabel);
      }
      if (!(_t177.isAlert === false || _t177.isAlert === true)) _t176.push(((p) + ".isAlert") + ": 期望 false|true");
      if (_t177.content !== undefined) {
      if (_t177.content === null || typeof _t177.content !== "object" || Array.isArray(_t177.content)) _t176.push(((p) + ".content") + ": 期望 object");
      else {
        const _t178 = _t177.content as Record<string, unknown>;
        if (typeof _t178.pluginId !== "string") _t176.push((((p) + ".content") + ".pluginId") + ": 期望 string，实收 " + typeof _t178.pluginId);
        if (typeof _t178.renderPath !== "string") _t176.push((((p) + ".content") + ".renderPath") + ": 期望 string，实收 " + typeof _t178.renderPath);
        if (_t178.payload !== undefined) {
        }
      }
      }
    }
  const _t179 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).open === true ? 1 : 0) + (((v as Record<string, unknown>).isAlert === false) || ((v as Record<string, unknown>).isAlert === true) ? 1 : 0)) : 0);
  const _t180 = [{ e: _t173, s: _t175 }, { e: _t176, s: _t179 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t180.length > 0) errs.push(..._t180);
  }
}
function chkPoolFloatingPanelButton(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t187 = v as Record<string, unknown>;
    if (typeof _t187.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t187.id);
    if (typeof _t187.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t187.label);
    if (typeof _t187.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t187.icon);
    if (_t187.toggledIcon !== undefined) {
    if (typeof _t187.toggledIcon !== "string") errs.push(((p) + ".toggledIcon") + ": 期望 string，实收 " + typeof _t187.toggledIcon);
    }
    if (_t187.toggledLabel !== undefined) {
    if (typeof _t187.toggledLabel !== "string") errs.push(((p) + ".toggledLabel") + ": 期望 string，实收 " + typeof _t187.toggledLabel);
    }
    if (_t187.expandOnHover !== undefined) {
    if (!(_t187.expandOnHover === false || _t187.expandOnHover === true)) errs.push(((p) + ".expandOnHover") + ": 期望 false|true");
    }
  }
}
function chkPoolFloatingPanelData(v: unknown, p: string, errs: string[]): void {
  const _t181: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t181.push((p) + ": 期望 object");
    else {
      const _t182 = v as Record<string, unknown>;
      if (_t182.open !== false) _t181.push(((p) + ".open") + ": 期望 false");
    }
  const _t183 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).open === false ? 1 : 0)) : 0);
  if (_t181.length > 0) {
  const _t184: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t184.push((p) + ": 期望 object");
    else {
      const _t185 = v as Record<string, unknown>;
      if (_t185.open !== true) _t184.push(((p) + ".open") + ": 期望 true");
      if (typeof _t185.viewId !== "string") _t184.push(((p) + ".viewId") + ": 期望 string，实收 " + typeof _t185.viewId);
      if (typeof _t185.title !== "string") _t184.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t185.title);
      if (typeof _t185.pluginId !== "string") _t184.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t185.pluginId);
      if (typeof _t185.renderPath !== "string") _t184.push(((p) + ".renderPath") + ": 期望 string，实收 " + typeof _t185.renderPath);
      if (!Array.isArray(_t185.actions)) _t184.push(((p) + ".actions") + ": 期望数组");
      else {
        for (let _t186 = 0; _t186 < _t185.actions.length; _t186++) {
            chkPoolFloatingPanelButton(_t185.actions[_t186], (((p) + ".actions") + "[" + _t186 + "]"), _t184);
        }
      }
      if (_t185.refresh !== undefined) {
      if (!(_t185.refresh === false || _t185.refresh === true)) _t184.push(((p) + ".refresh") + ": 期望 false|true");
      }
    }
  const _t188 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).open === true ? 1 : 0) + (((v as Record<string, unknown>).refresh === false) || ((v as Record<string, unknown>).refresh === true) ? 1 : 0)) : 0);
  const _t189 = [{ e: _t181, s: _t183 }, { e: _t184, s: _t188 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t189.length > 0) errs.push(..._t189);
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
