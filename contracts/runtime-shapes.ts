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
function chkIconBarOwnedButton(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t80 = v as Record<string, unknown>;
    if (typeof _t80.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t80.id);
    chkIconBarIcon(_t80.icon, ((p) + ".icon"), errs);
    if (typeof _t80.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t80.label);
    if (_t80.location !== "bottom") errs.push(((p) + ".location") + ": 期望 bottom");
    if (typeof _t80.menuId !== "string") errs.push(((p) + ".menuId") + ": 期望 string，实收 " + typeof _t80.menuId);
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
    if (!Array.isArray(_t63.owned)) errs.push(((p) + ".owned") + ": 期望数组");
    else {
      for (let _t79 = 0; _t79 < _t63.owned.length; _t79++) {
          chkIconBarOwnedButton(_t63.owned[_t79], (((p) + ".owned") + "[" + _t79 + "]"), errs);
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
      const _t81 = _t63.hamburger as Record<string, unknown>;
      if (typeof _t81.title !== "string") errs.push((((p) + ".hamburger") + ".title") + ": 期望 string，实收 " + typeof _t81.title);
      if (!Array.isArray(_t81.groups)) errs.push((((p) + ".hamburger") + ".groups") + ": 期望数组");
      else {
        for (let _t82 = 0; _t82 < _t81.groups.length; _t82++) {
            chkPoolMenuGroup(_t81.groups[_t82], ((((p) + ".hamburger") + ".groups") + "[" + _t82 + "]"), errs);
        }
      }
    }
    }
  }
}
function chkTitleActionItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t93 = v as Record<string, unknown>;
    if (typeof _t93.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t93.label);
    if (typeof _t93.command !== "string") errs.push(((p) + ".command") + ": 期望 string，实收 " + typeof _t93.command);
    if (_t93.args !== undefined) {
    }
  }
}
function chkTitleActionWidget(v: unknown, p: string, errs: string[]): void {
  const _t87: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t87.push((p) + ": 期望 object");
    else {
      const _t88 = v as Record<string, unknown>;
      if (_t88.type !== "icon") _t87.push(((p) + ".type") + ": 期望 icon");
      if (typeof _t88.id !== "string") _t87.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t88.id);
      if (typeof _t88.command !== "string") _t87.push(((p) + ".command") + ": 期望 string，实收 " + typeof _t88.command);
      if (typeof _t88.icon !== "string") _t87.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t88.icon);
      if (typeof _t88.title !== "string") _t87.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t88.title);
      if (_t88.args !== undefined) {
      }
    }
  const _t89 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "icon" ? 1 : 0)) : 0);
  if (_t87.length > 0) {
  const _t90: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t90.push((p) + ": 期望 object");
    else {
      const _t91 = v as Record<string, unknown>;
      if (_t91.type !== "dropdown") _t90.push(((p) + ".type") + ": 期望 dropdown");
      if (typeof _t91.id !== "string") _t90.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t91.id);
      if (!Array.isArray(_t91.items)) _t90.push(((p) + ".items") + ": 期望数组");
      else {
        for (let _t92 = 0; _t92 < _t91.items.length; _t92++) {
            chkTitleActionItem(_t91.items[_t92], (((p) + ".items") + "[" + _t92 + "]"), _t90);
        }
      }
      if (_t91.title !== undefined) {
      if (typeof _t91.title !== "string") _t90.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t91.title);
      }
    }
  const _t94 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "dropdown" ? 1 : 0)) : 0);
  if (_t90.length > 0) {
  const _t95: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t95.push((p) + ": 期望 object");
    else {
      const _t96 = v as Record<string, unknown>;
      if (_t96.type !== "split") _t95.push(((p) + ".type") + ": 期望 split");
      if (typeof _t96.id !== "string") _t95.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t96.id);
      if (typeof _t96.command !== "string") _t95.push(((p) + ".command") + ": 期望 string，实收 " + typeof _t96.command);
      if (_t96.icon !== undefined) {
      if (typeof _t96.icon !== "string") _t95.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t96.icon);
      }
      if (typeof _t96.title !== "string") _t95.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t96.title);
      if (!Array.isArray(_t96.items)) _t95.push(((p) + ".items") + ": 期望数组");
      else {
        for (let _t97 = 0; _t97 < _t96.items.length; _t97++) {
            chkTitleActionItem(_t96.items[_t97], (((p) + ".items") + "[" + _t97 + "]"), _t95);
        }
      }
      if (_t96.args !== undefined) {
      }
    }
  const _t98 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "split" ? 1 : 0)) : 0);
  const _t99 = [{ e: _t87, s: _t89 }, { e: _t90, s: _t94 }, { e: _t95, s: _t98 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t99.length > 0) errs.push(..._t99);
  }
  }
}
function chkSidebarViewMeta(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t85 = v as Record<string, unknown>;
    if (typeof _t85.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t85.id);
    if (typeof _t85.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t85.title);
    if (typeof _t85.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t85.pluginId);
    if (typeof _t85.renderPath !== "string") errs.push(((p) + ".renderPath") + ": 期望 string，实收 " + typeof _t85.renderPath);
    if (_t85.role !== undefined) {
    if (!(_t85.role === "toolbar" || _t85.role === "section")) errs.push(((p) + ".role") + ": 期望 toolbar|section");
    }
    if (_t85.order !== undefined) {
    if (typeof _t85.order !== "number") errs.push(((p) + ".order") + ": 期望 number，实收 " + typeof _t85.order);
    }
    if (_t85.collapsed !== undefined) {
    if (!(_t85.collapsed === false || _t85.collapsed === true)) errs.push(((p) + ".collapsed") + ": 期望 false|true");
    }
    if (_t85.badge !== undefined) {
    if (!(typeof _t85.badge === "string" || typeof _t85.badge === "number")) errs.push(((p) + ".badge") + ": 期望 string|number");
    }
    if (_t85.titleDescription !== undefined) {
    if (typeof _t85.titleDescription !== "string") errs.push(((p) + ".titleDescription") + ": 期望 string，实收 " + typeof _t85.titleDescription);
    }
    if (_t85.titleTooltip !== undefined) {
    if (typeof _t85.titleTooltip !== "string") errs.push(((p) + ".titleTooltip") + ": 期望 string，实收 " + typeof _t85.titleTooltip);
    }
    if (_t85.singleViewPaneContainerTitle !== undefined) {
    if (typeof _t85.singleViewPaneContainerTitle !== "string") errs.push(((p) + ".singleViewPaneContainerTitle") + ": 期望 string，实收 " + typeof _t85.singleViewPaneContainerTitle);
    }
    if (_t85.minHeight !== undefined) {
    if (typeof _t85.minHeight !== "number") errs.push(((p) + ".minHeight") + ": 期望 number，实收 " + typeof _t85.minHeight);
    }
    if (_t85.titleActions !== undefined) {
    if (!Array.isArray(_t85.titleActions)) errs.push(((p) + ".titleActions") + ": 期望数组");
    else {
      for (let _t86 = 0; _t86 < _t85.titleActions.length; _t86++) {
          chkTitleActionWidget(_t85.titleActions[_t86], (((p) + ".titleActions") + "[" + _t86 + "]"), errs);
      }
    }
    }
  }
}
function chkSidebarContainerLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t101 = v as Record<string, unknown>;
    if (typeof _t101.containerId !== "string") errs.push(((p) + ".containerId") + ": 期望 string，实收 " + typeof _t101.containerId);
    if (typeof _t101.containerTitle !== "string") errs.push(((p) + ".containerTitle") + ": 期望 string，实收 " + typeof _t101.containerTitle);
    if (_t101.mergeHeaderWhenSingle !== undefined) {
    if (!(_t101.mergeHeaderWhenSingle === false || _t101.mergeHeaderWhenSingle === true)) errs.push(((p) + ".mergeHeaderWhenSingle") + ": 期望 false|true");
    }
    if (!Array.isArray(_t101.views)) errs.push(((p) + ".views") + ": 期望数组");
    else {
      for (let _t102 = 0; _t102 < _t101.views.length; _t102++) {
          chkSidebarViewMeta(_t101.views[_t102], (((p) + ".views") + "[" + _t102 + "]"), errs);
      }
    }
  }
}
function chkSidebarLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t83 = v as Record<string, unknown>;
    if (!(_t83.visible === false || _t83.visible === true)) errs.push(((p) + ".visible") + ": 期望 false|true");
    if (typeof _t83.width !== "number") errs.push(((p) + ".width") + ": 期望 number，实收 " + typeof _t83.width);
    if (_t83.edge !== undefined) {
    if (!(_t83.edge === "left" || _t83.edge === "right")) errs.push(((p) + ".edge") + ": 期望 left|right");
    }
    if (!(_t83.containerId === null || typeof _t83.containerId === "string")) errs.push(((p) + ".containerId") + ": 期望 null|string");
    if (typeof _t83.containerTitle !== "string") errs.push(((p) + ".containerTitle") + ": 期望 string，实收 " + typeof _t83.containerTitle);
    if (_t83.mergeHeaderWhenSingle !== undefined) {
    if (!(_t83.mergeHeaderWhenSingle === false || _t83.mergeHeaderWhenSingle === true)) errs.push(((p) + ".mergeHeaderWhenSingle") + ": 期望 false|true");
    }
    if (!Array.isArray(_t83.views)) errs.push(((p) + ".views") + ": 期望数组");
    else {
      for (let _t84 = 0; _t84 < _t83.views.length; _t84++) {
          chkSidebarViewMeta(_t83.views[_t84], (((p) + ".views") + "[" + _t84 + "]"), errs);
      }
    }
    if (_t83.containers !== undefined) {
    if (!Array.isArray(_t83.containers)) errs.push(((p) + ".containers") + ": 期望数组");
    else {
      for (let _t100 = 0; _t100 < _t83.containers.length; _t100++) {
          chkSidebarContainerLayout(_t83.containers[_t100], (((p) + ".containers") + "[" + _t100 + "]"), errs);
      }
    }
    }
    if (_t83.collapsedViews !== undefined) {
    if (!Array.isArray(_t83.collapsedViews)) errs.push(((p) + ".collapsedViews") + ": 期望数组");
    else {
      for (let _t103 = 0; _t103 < _t83.collapsedViews.length; _t103++) {
          if (typeof _t83.collapsedViews[_t103] !== "string") errs.push((((p) + ".collapsedViews") + "[" + _t103 + "]") + ": 期望 string，实收 " + typeof _t83.collapsedViews[_t103]);
      }
    }
    }
    if (_t83.collapsed !== undefined) {
    if (!(_t83.collapsed === false || _t83.collapsed === true)) errs.push(((p) + ".collapsed") + ": 期望 false|true");
    }
    if (_t83.emptyText !== undefined) {
    if (typeof _t83.emptyText !== "string") errs.push(((p) + ".emptyText") + ": 期望 string，实收 " + typeof _t83.emptyText);
    }
    if (_t83.emptyHint !== undefined) {
    if (typeof _t83.emptyHint !== "string") errs.push(((p) + ".emptyHint") + ": 期望 string，实收 " + typeof _t83.emptyHint);
    }
    if (_t83.minWidth !== undefined) {
    if (typeof _t83.minWidth !== "number") errs.push(((p) + ".minWidth") + ": 期望 number，实收 " + typeof _t83.minWidth);
    }
    if (_t83.maxWidth !== undefined) {
    if (typeof _t83.maxWidth !== "number") errs.push(((p) + ".maxWidth") + ": 期望 number，实收 " + typeof _t83.maxWidth);
    }
    if (_t83.viewId !== undefined) {
    if (!(_t83.viewId === null || typeof _t83.viewId === "string")) errs.push(((p) + ".viewId") + ": 期望 null|string");
    }
  }
}
function chkRightSidebarLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t104 = v as Record<string, unknown>;
    if (!(_t104.visible === false || _t104.visible === true)) errs.push(((p) + ".visible") + ": 期望 false|true");
    if (typeof _t104.width !== "number") errs.push(((p) + ".width") + ": 期望 number，实收 " + typeof _t104.width);
    if (!(_t104.containerId === null || typeof _t104.containerId === "string")) errs.push(((p) + ".containerId") + ": 期望 null|string");
    if (typeof _t104.containerTitle !== "string") errs.push(((p) + ".containerTitle") + ": 期望 string，实收 " + typeof _t104.containerTitle);
    if (_t104.mergeHeaderWhenSingle !== undefined) {
    if (!(_t104.mergeHeaderWhenSingle === false || _t104.mergeHeaderWhenSingle === true)) errs.push(((p) + ".mergeHeaderWhenSingle") + ": 期望 false|true");
    }
    if (!Array.isArray(_t104.views)) errs.push(((p) + ".views") + ": 期望数组");
    else {
      for (let _t105 = 0; _t105 < _t104.views.length; _t105++) {
          chkSidebarViewMeta(_t104.views[_t105], (((p) + ".views") + "[" + _t105 + "]"), errs);
      }
    }
    if (_t104.containers !== undefined) {
    if (!Array.isArray(_t104.containers)) errs.push(((p) + ".containers") + ": 期望数组");
    else {
      for (let _t106 = 0; _t106 < _t104.containers.length; _t106++) {
          chkSidebarContainerLayout(_t104.containers[_t106], (((p) + ".containers") + "[" + _t106 + "]"), errs);
      }
    }
    }
    if (_t104.collapsedViews !== undefined) {
    if (!Array.isArray(_t104.collapsedViews)) errs.push(((p) + ".collapsedViews") + ": 期望数组");
    else {
      for (let _t107 = 0; _t107 < _t104.collapsedViews.length; _t107++) {
          if (typeof _t104.collapsedViews[_t107] !== "string") errs.push((((p) + ".collapsedViews") + "[" + _t107 + "]") + ": 期望 string，实收 " + typeof _t104.collapsedViews[_t107]);
      }
    }
    }
    if (_t104.collapsed !== undefined) {
    if (!(_t104.collapsed === false || _t104.collapsed === true)) errs.push(((p) + ".collapsed") + ": 期望 false|true");
    }
    if (_t104.minWidth !== undefined) {
    if (typeof _t104.minWidth !== "number") errs.push(((p) + ".minWidth") + ": 期望 number，实收 " + typeof _t104.minWidth);
    }
    if (_t104.maxWidth !== undefined) {
    if (typeof _t104.maxWidth !== "number") errs.push(((p) + ".maxWidth") + ": 期望 number，实收 " + typeof _t104.maxWidth);
    }
    if (_t104.emptyText !== undefined) {
    if (typeof _t104.emptyText !== "string") errs.push(((p) + ".emptyText") + ": 期望 string，实收 " + typeof _t104.emptyText);
    }
    if (_t104.emptyHint !== undefined) {
    if (typeof _t104.emptyHint !== "string") errs.push(((p) + ".emptyHint") + ": 期望 string，实收 " + typeof _t104.emptyHint);
    }
  }
}
function chkPoolReleaseNotesHistoryItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t118 = v as Record<string, unknown>;
    if (typeof _t118.version !== "string") errs.push(((p) + ".version") + ": 期望 string，实收 " + typeof _t118.version);
    if (typeof _t118.dateLabel !== "string") errs.push(((p) + ".dateLabel") + ": 期望 string，实收 " + typeof _t118.dateLabel);
  }
}
function chkPoolReleaseNotesData(v: unknown, p: string, errs: string[]): void {
  const _t112: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t112.push((p) + ": 期望 object");
    else {
      const _t113 = v as Record<string, unknown>;
      if (_t113.state !== "loading") _t112.push(((p) + ".state") + ": 期望 loading");
    }
  const _t114 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).state === "loading" ? 1 : 0)) : 0);
  if (_t112.length > 0) {
  const _t115: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t115.push((p) + ": 期望 object");
    else {
      const _t116 = v as Record<string, unknown>;
      if (_t116.state !== "content") _t115.push(((p) + ".state") + ": 期望 content");
      if (typeof _t116.version !== "string") _t115.push(((p) + ".version") + ": 期望 string，实收 " + typeof _t116.version);
      if (typeof _t116.subtitle !== "string") _t115.push(((p) + ".subtitle") + ": 期望 string，实收 " + typeof _t116.subtitle);
      if (typeof _t116.channelLabel !== "string") _t115.push(((p) + ".channelLabel") + ": 期望 string，实收 " + typeof _t116.channelLabel);
      if (typeof _t116.body !== "string") _t115.push(((p) + ".body") + ": 期望 string，实收 " + typeof _t116.body);
      if (_t116.listUrl !== undefined) {
      if (typeof _t116.listUrl !== "string") _t115.push(((p) + ".listUrl") + ": 期望 string，实收 " + typeof _t116.listUrl);
      }
      if (!Array.isArray(_t116.historical)) _t115.push(((p) + ".historical") + ": 期望数组");
      else {
        for (let _t117 = 0; _t117 < _t116.historical.length; _t117++) {
            chkPoolReleaseNotesHistoryItem(_t116.historical[_t117], (((p) + ".historical") + "[" + _t117 + "]"), _t115);
        }
      }
      if (_t116.refreshing !== undefined) {
      if (!(_t116.refreshing === false || _t116.refreshing === true)) _t115.push(((p) + ".refreshing") + ": 期望 false|true");
      }
      if (_t116.refreshNote !== undefined) {
      if (typeof _t116.refreshNote !== "string") _t115.push(((p) + ".refreshNote") + ": 期望 string，实收 " + typeof _t116.refreshNote);
      }
      if (_t116.banner !== undefined) {
      if (typeof _t116.banner !== "string") _t115.push(((p) + ".banner") + ": 期望 string，实收 " + typeof _t116.banner);
      }
    }
  const _t119 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).state === "content" ? 1 : 0) + (((v as Record<string, unknown>).refreshing === false) || ((v as Record<string, unknown>).refreshing === true) ? 1 : 0)) : 0);
  if (_t115.length > 0) {
  const _t120: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t120.push((p) + ": 期望 object");
    else {
      const _t121 = v as Record<string, unknown>;
      if (_t121.state !== "empty") _t120.push(((p) + ".state") + ": 期望 empty");
      if (_t121.listUrl !== undefined) {
      if (typeof _t121.listUrl !== "string") _t120.push(((p) + ".listUrl") + ": 期望 string，实收 " + typeof _t121.listUrl);
      }
    }
  const _t122 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).state === "empty" ? 1 : 0)) : 0);
  const _t123 = [{ e: _t112, s: _t114 }, { e: _t115, s: _t119 }, { e: _t120, s: _t122 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t123.length > 0) errs.push(..._t123);
  }
  }
}
function chkPoolAboutField(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t132 = v as Record<string, unknown>;
    if (typeof _t132.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t132.label);
    if (typeof _t132.value !== "string") errs.push(((p) + ".value") + ": 期望 string，实收 " + typeof _t132.value);
    if (_t132.href !== undefined) {
    if (typeof _t132.href !== "string") errs.push(((p) + ".href") + ": 期望 string，实收 " + typeof _t132.href);
    }
    if (_t132.secondary !== undefined) {
    if (!(_t132.secondary === false || _t132.secondary === true)) errs.push(((p) + ".secondary") + ": 期望 false|true");
    }
  }
}
function chkPoolAboutCard(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t130 = v as Record<string, unknown>;
    if (typeof _t130.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t130.title);
    if (!Array.isArray(_t130.rows)) errs.push(((p) + ".rows") + ": 期望数组");
    else {
      for (let _t131 = 0; _t131 < _t130.rows.length; _t131++) {
          chkPoolAboutField(_t130.rows[_t131], (((p) + ".rows") + "[" + _t131 + "]"), errs);
      }
    }
  }
}
function chkPoolAboutData(v: unknown, p: string, errs: string[]): void {
  const _t124: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t124.push((p) + ": 期望 object");
    else {
      const _t125 = v as Record<string, unknown>;
      if (_t125.state !== "loading") _t124.push(((p) + ".state") + ": 期望 loading");
    }
  const _t126 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).state === "loading" ? 1 : 0)) : 0);
  if (_t124.length > 0) {
  const _t127: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t127.push((p) + ": 期望 object");
    else {
      const _t128 = v as Record<string, unknown>;
      if (_t128.state !== "content") _t127.push(((p) + ".state") + ": 期望 content");
      if (typeof _t128.name !== "string") _t127.push(((p) + ".name") + ": 期望 string，实收 " + typeof _t128.name);
      if (typeof _t128.logoUrl !== "string") _t127.push(((p) + ".logoUrl") + ": 期望 string，实收 " + typeof _t128.logoUrl);
      if (typeof _t128.version !== "string") _t127.push(((p) + ".version") + ": 期望 string，实收 " + typeof _t128.version);
      if (typeof _t128.tagline !== "string") _t127.push(((p) + ".tagline") + ": 期望 string，实收 " + typeof _t128.tagline);
      if (!Array.isArray(_t128.cards)) _t127.push(((p) + ".cards") + ": 期望数组");
      else {
        for (let _t129 = 0; _t129 < _t128.cards.length; _t129++) {
            chkPoolAboutCard(_t128.cards[_t129], (((p) + ".cards") + "[" + _t129 + "]"), _t127);
        }
      }
      if (_t128.footerCopyright !== undefined) {
      if (typeof _t128.footerCopyright !== "string") _t127.push(((p) + ".footerCopyright") + ": 期望 string，实收 " + typeof _t128.footerCopyright);
      }
      if (_t128.repoUrl !== undefined) {
      if (typeof _t128.repoUrl !== "string") _t127.push(((p) + ".repoUrl") + ": 期望 string，实收 " + typeof _t128.repoUrl);
      }
    }
  const _t133 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).state === "content" ? 1 : 0)) : 0);
  const _t134 = [{ e: _t124, s: _t126 }, { e: _t127, s: _t133 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t134.length > 0) errs.push(..._t134);
  }
}
function chkPoolAiManualChapter(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t141 = v as Record<string, unknown>;
    if (typeof _t141.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t141.id);
    if (typeof _t141.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t141.title);
    if (typeof _t141.markdown !== "string") errs.push(((p) + ".markdown") + ": 期望 string，实收 " + typeof _t141.markdown);
  }
}
function chkPoolAiManualData(v: unknown, p: string, errs: string[]): void {
  const _t135: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t135.push((p) + ": 期望 object");
    else {
      const _t136 = v as Record<string, unknown>;
      if (_t136.state !== "loading") _t135.push(((p) + ".state") + ": 期望 loading");
    }
  const _t137 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).state === "loading" ? 1 : 0)) : 0);
  if (_t135.length > 0) {
  const _t138: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t138.push((p) + ": 期望 object");
    else {
      const _t139 = v as Record<string, unknown>;
      if (_t139.state !== "content") _t138.push(((p) + ".state") + ": 期望 content");
      if (typeof _t139.version !== "string") _t138.push(((p) + ".version") + ": 期望 string，实收 " + typeof _t139.version);
      if (!Array.isArray(_t139.chapters)) _t138.push(((p) + ".chapters") + ": 期望数组");
      else {
        for (let _t140 = 0; _t140 < _t139.chapters.length; _t140++) {
            chkPoolAiManualChapter(_t139.chapters[_t140], (((p) + ".chapters") + "[" + _t140 + "]"), _t138);
        }
      }
    }
  const _t142 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).state === "content" ? 1 : 0)) : 0);
  if (_t138.length > 0) {
  const _t143: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t143.push((p) + ": 期望 object");
    else {
      const _t144 = v as Record<string, unknown>;
      if (_t144.state !== "empty") _t143.push(((p) + ".state") + ": 期望 empty");
      if (typeof _t144.dir !== "string") _t143.push(((p) + ".dir") + ": 期望 string，实收 " + typeof _t144.dir);
    }
  const _t145 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).state === "empty" ? 1 : 0)) : 0);
  const _t146 = [{ e: _t135, s: _t137 }, { e: _t138, s: _t142 }, { e: _t143, s: _t145 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t146.length > 0) errs.push(..._t146);
  }
  }
}
function chkPoolTab(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t111 = v as Record<string, unknown>;
    if (typeof _t111.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t111.id);
    if (typeof _t111.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t111.pluginId);
    if (typeof _t111.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t111.title);
    if (_t111.sourceId !== undefined) {
    if (typeof _t111.sourceId !== "string") errs.push(((p) + ".sourceId") + ": 期望 string，实收 " + typeof _t111.sourceId);
    }
    if (_t111.hint !== undefined) {
    if (typeof _t111.hint !== "string") errs.push(((p) + ".hint") + ": 期望 string，实收 " + typeof _t111.hint);
    }
    if (_t111.dirty !== undefined) {
    if (!(_t111.dirty === false || _t111.dirty === true)) errs.push(((p) + ".dirty") + ": 期望 false|true");
    }
    if (_t111.icon !== undefined) {
    chkIconBarIcon(_t111.icon, ((p) + ".icon"), errs);
    }
    if (_t111.pinned !== undefined) {
    if (!(_t111.pinned === false || _t111.pinned === true)) errs.push(((p) + ".pinned") + ": 期望 false|true");
    }
    if (_t111.closeBehavior !== undefined) {
    if (!(_t111.closeBehavior === "normal" || _t111.closeBehavior === "confirm" || _t111.closeBehavior === "blocked")) errs.push(((p) + ".closeBehavior") + ": 期望 normal|confirm|blocked");
    }
    if (_t111.singleton !== undefined) {
    if (!(_t111.singleton === false || _t111.singleton === true)) errs.push(((p) + ".singleton") + ": 期望 false|true");
    }
    if (_t111.shellRendered !== undefined) {
    if (!(_t111.shellRendered === false || _t111.shellRendered === true)) errs.push(((p) + ".shellRendered") + ": 期望 false|true");
    }
    if (_t111.shellType !== undefined) {
    if (typeof _t111.shellType !== "string") errs.push(((p) + ".shellType") + ": 期望 string，实收 " + typeof _t111.shellType);
    }
    if (_t111.detailPluginId !== undefined) {
    if (typeof _t111.detailPluginId !== "string") errs.push(((p) + ".detailPluginId") + ": 期望 string，实收 " + typeof _t111.detailPluginId);
    }
    if (_t111.detailContributorId !== undefined) {
    if (typeof _t111.detailContributorId !== "string") errs.push(((p) + ".detailContributorId") + ": 期望 string，实收 " + typeof _t111.detailContributorId);
    }
    if (_t111.detailViewRenderPath !== undefined) {
    if (typeof _t111.detailViewRenderPath !== "string") errs.push(((p) + ".detailViewRenderPath") + ": 期望 string，实收 " + typeof _t111.detailViewRenderPath);
    }
    if (_t111.releaseNotes !== undefined) {
    chkPoolReleaseNotesData(_t111.releaseNotes, ((p) + ".releaseNotes"), errs);
    }
    if (_t111.about !== undefined) {
    chkPoolAboutData(_t111.about, ((p) + ".about"), errs);
    }
    if (_t111.aiManual !== undefined) {
    chkPoolAiManualData(_t111.aiManual, ((p) + ".aiManual"), errs);
    }
  }
}
function chkPoolGroup(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t109 = v as Record<string, unknown>;
    if (typeof _t109.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t109.id);
    if (typeof _t109.flex !== "number") errs.push(((p) + ".flex") + ": 期望 number，实收 " + typeof _t109.flex);
    if (typeof _t109.activeTabId !== "string") errs.push(((p) + ".activeTabId") + ": 期望 string，实收 " + typeof _t109.activeTabId);
    if (!Array.isArray(_t109.tabs)) errs.push(((p) + ".tabs") + ": 期望数组");
    else {
      for (let _t110 = 0; _t110 < _t109.tabs.length; _t110++) {
          chkPoolTab(_t109.tabs[_t110], (((p) + ".tabs") + "[" + _t110 + "]"), errs);
      }
    }
  }
}
function chkSplitNode(v: unknown, p: string, errs: string[]): void {
  const _t147: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t147.push((p) + ": 期望 object");
    else {
      const _t148 = v as Record<string, unknown>;
      if (_t148.type !== "leaf") _t147.push(((p) + ".type") + ": 期望 leaf");
      if (typeof _t148.groupId !== "string") _t147.push(((p) + ".groupId") + ": 期望 string，实收 " + typeof _t148.groupId);
    }
  const _t149 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "leaf" ? 1 : 0)) : 0);
  if (_t147.length > 0) {
  const _t150: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t150.push((p) + ": 期望 object");
    else {
      const _t151 = v as Record<string, unknown>;
      if (_t151.type !== "branch") _t150.push(((p) + ".type") + ": 期望 branch");
      if (!(_t151.direction === "horizontal" || _t151.direction === "vertical")) _t150.push(((p) + ".direction") + ": 期望 horizontal|vertical");
      if (!Array.isArray(_t151.children)) _t150.push(((p) + ".children") + ": 期望数组");
      else {
        if (_t151.children.length !== 2) _t150.push(((p) + ".children") + ": 期望长度 2");
          chkSplitNode(_t151.children[0], (((p) + ".children") + "[0]"), _t150);
          chkSplitNode(_t151.children[1], (((p) + ".children") + "[1]"), _t150);
      }
      if (!Array.isArray(_t151.sizes)) _t150.push(((p) + ".sizes") + ": 期望数组");
      else {
        if (_t151.sizes.length !== 2) _t150.push(((p) + ".sizes") + ": 期望长度 2");
          if (typeof _t151.sizes[0] !== "number") _t150.push((((p) + ".sizes") + "[0]") + ": 期望 number，实收 " + typeof _t151.sizes[0]);
          if (typeof _t151.sizes[1] !== "number") _t150.push((((p) + ".sizes") + "[1]") + ": 期望 number，实收 " + typeof _t151.sizes[1]);
      }
    }
  const _t152 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "branch" ? 1 : 0) + (((v as Record<string, unknown>).direction === "horizontal") || ((v as Record<string, unknown>).direction === "vertical") ? 1 : 0)) : 0);
  const _t153 = [{ e: _t147, s: _t149 }, { e: _t150, s: _t152 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t153.length > 0) errs.push(..._t153);
  }
}
function chkCreatableViewMeta(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t155 = v as Record<string, unknown>;
    if (typeof _t155.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t155.pluginId);
    if (typeof _t155.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t155.label);
  }
}
function chkPanelViewMeta(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t158 = v as Record<string, unknown>;
    if (typeof _t158.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t158.id);
    if (typeof _t158.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t158.title);
    if (typeof _t158.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t158.pluginId);
    if (typeof _t158.renderPath !== "string") errs.push(((p) + ".renderPath") + ": 期望 string，实收 " + typeof _t158.renderPath);
    if (_t158.titleActions !== undefined) {
    if (!Array.isArray(_t158.titleActions)) errs.push(((p) + ".titleActions") + ": 期望数组");
    else {
      for (let _t159 = 0; _t159 < _t158.titleActions.length; _t159++) {
          chkTitleActionWidget(_t158.titleActions[_t159], (((p) + ".titleActions") + "[" + _t159 + "]"), errs);
      }
    }
    }
  }
}
function chkPanelSwitcherItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t163 = v as Record<string, unknown>;
    if (typeof _t163.viewId !== "string") errs.push(((p) + ".viewId") + ": 期望 string，实收 " + typeof _t163.viewId);
    if (typeof _t163.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t163.title);
    if (typeof _t163.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t163.pluginId);
    if (!(_t163.visible === false || _t163.visible === true)) errs.push(((p) + ".visible") + ": 期望 false|true");
    if (!(_t163.active === false || _t163.active === true)) errs.push(((p) + ".active") + ": 期望 false|true");
  }
}
function chkPanelSwitcherGroup(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t161 = v as Record<string, unknown>;
    if (typeof _t161.containerId !== "string") errs.push(((p) + ".containerId") + ": 期望 string，实收 " + typeof _t161.containerId);
    if (typeof _t161.containerTitle !== "string") errs.push(((p) + ".containerTitle") + ": 期望 string，实收 " + typeof _t161.containerTitle);
    if (!Array.isArray(_t161.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t162 = 0; _t162 < _t161.items.length; _t162++) {
          chkPanelSwitcherItem(_t161.items[_t162], (((p) + ".items") + "[" + _t162 + "]"), errs);
      }
    }
  }
}
function chkPanelLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t156 = v as Record<string, unknown>;
    if (!(_t156.visible === false || _t156.visible === true)) errs.push(((p) + ".visible") + ": 期望 false|true");
    if (typeof _t156.height !== "number") errs.push(((p) + ".height") + ": 期望 number，实收 " + typeof _t156.height);
    if (_t156.edge !== undefined) {
    if (!(_t156.edge === "top" || _t156.edge === "bottom" || _t156.edge === "left" || _t156.edge === "right")) errs.push(((p) + ".edge") + ": 期望 top|bottom|left|right");
    }
    if (_t156.align !== undefined) {
    if (!(_t156.align === "left" || _t156.align === "right" || _t156.align === "center" || _t156.align === "justify")) errs.push(((p) + ".align") + ": 期望 left|right|center|justify");
    }
    if (_t156.width !== undefined) {
    if (typeof _t156.width !== "number") errs.push(((p) + ".width") + ": 期望 number，实收 " + typeof _t156.width);
    }
    if (typeof _t156.activeViewId !== "string") errs.push(((p) + ".activeViewId") + ": 期望 string，实收 " + typeof _t156.activeViewId);
    if (!Array.isArray(_t156.views)) errs.push(((p) + ".views") + ": 期望数组");
    else {
      for (let _t157 = 0; _t157 < _t156.views.length; _t157++) {
          chkPanelViewMeta(_t156.views[_t157], (((p) + ".views") + "[" + _t157 + "]"), errs);
      }
    }
    if (_t156.minHeight !== undefined) {
    if (typeof _t156.minHeight !== "number") errs.push(((p) + ".minHeight") + ": 期望 number，实收 " + typeof _t156.minHeight);
    }
    if (_t156.maxHeight !== undefined) {
    if (typeof _t156.maxHeight !== "number") errs.push(((p) + ".maxHeight") + ": 期望 number，实收 " + typeof _t156.maxHeight);
    }
    if (_t156.minWidth !== undefined) {
    if (typeof _t156.minWidth !== "number") errs.push(((p) + ".minWidth") + ": 期望 number，实收 " + typeof _t156.minWidth);
    }
    if (_t156.maxWidth !== undefined) {
    if (typeof _t156.maxWidth !== "number") errs.push(((p) + ".maxWidth") + ": 期望 number，实收 " + typeof _t156.maxWidth);
    }
    if (_t156.createTooltip !== undefined) {
    if (typeof _t156.createTooltip !== "string") errs.push(((p) + ".createTooltip") + ": 期望 string，实收 " + typeof _t156.createTooltip);
    }
    if (_t156.switcher !== undefined) {
    if (!Array.isArray(_t156.switcher)) errs.push(((p) + ".switcher") + ": 期望数组");
    else {
      for (let _t160 = 0; _t160 < _t156.switcher.length; _t160++) {
          chkPanelSwitcherGroup(_t156.switcher[_t160], (((p) + ".switcher") + "[" + _t160 + "]"), errs);
      }
    }
    }
    if (_t156.emptyText !== undefined) {
    if (typeof _t156.emptyText !== "string") errs.push(((p) + ".emptyText") + ": 期望 string，实收 " + typeof _t156.emptyText);
    }
    if (_t156.emptyHint !== undefined) {
    if (typeof _t156.emptyHint !== "string") errs.push(((p) + ".emptyHint") + ": 期望 string，实收 " + typeof _t156.emptyHint);
    }
    if (_t156.detachable !== undefined) {
    if (!(_t156.detachable === false || _t156.detachable === true)) errs.push(((p) + ".detachable") + ": 期望 false|true");
    }
    if (_t156.detachTooltip !== undefined) {
    if (typeof _t156.detachTooltip !== "string") errs.push(((p) + ".detachTooltip") + ": 期望 string，实收 " + typeof _t156.detachTooltip);
    }
  }
}
function chkPoolStatusBarItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t166 = v as Record<string, unknown>;
    if (typeof _t166.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t166.id);
    if (typeof _t166.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t166.pluginId);
    if (_t166.icon !== undefined) {
    if (typeof _t166.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t166.icon);
    }
    if (typeof _t166.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t166.label);
    if (_t166.title !== undefined) {
    if (typeof _t166.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t166.title);
    }
    if (!(_t166.align === "left" || _t166.align === "right")) errs.push(((p) + ".align") + ": 期望 left|right");
    if (_t166.onClick !== undefined) {
    if (typeof _t166.onClick !== "string") errs.push(((p) + ".onClick") + ": 期望 string，实收 " + typeof _t166.onClick);
    }
    if (_t166.componentRenderPath !== undefined) {
    if (typeof _t166.componentRenderPath !== "string") errs.push(((p) + ".componentRenderPath") + ": 期望 string，实收 " + typeof _t166.componentRenderPath);
    }
    if (_t166.dividerBefore !== undefined) {
    if (!(_t166.dividerBefore === false || _t166.dividerBefore === true)) errs.push(((p) + ".dividerBefore") + ": 期望 false|true");
    }
  }
}
function chkNotifJobRow(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t171 = v as Record<string, unknown>;
    if (typeof _t171.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t171.id);
    if (typeof _t171.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t171.pluginId);
    if (typeof _t171.name !== "string") errs.push(((p) + ".name") + ": 期望 string，实收 " + typeof _t171.name);
    if (typeof _t171.iconClass !== "string") errs.push(((p) + ".iconClass") + ": 期望 string，实收 " + typeof _t171.iconClass);
    if (typeof _t171.statusLabel !== "string") errs.push(((p) + ".statusLabel") + ": 期望 string，实收 " + typeof _t171.statusLabel);
    if (_t171.percent !== undefined) {
    if (typeof _t171.percent !== "number") errs.push(((p) + ".percent") + ": 期望 number，实收 " + typeof _t171.percent);
    }
    if (_t171.cancellable !== undefined) {
    if (!(_t171.cancellable === false || _t171.cancellable === true)) errs.push(((p) + ".cancellable") + ": 期望 false|true");
    }
    if (_t171.cancelLabel !== undefined) {
    if (typeof _t171.cancelLabel !== "string") errs.push(((p) + ".cancelLabel") + ": 期望 string，实收 " + typeof _t171.cancelLabel);
    }
  }
}
function chkNotifSection(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t169 = v as Record<string, unknown>;
    if (typeof _t169.key !== "string") errs.push(((p) + ".key") + ": 期望 string，实收 " + typeof _t169.key);
    if (typeof _t169.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t169.label);
    if (!Array.isArray(_t169.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t170 = 0; _t170 < _t169.items.length; _t170++) {
          chkNotifJobRow(_t169.items[_t170], (((p) + ".items") + "[" + _t170 + "]"), errs);
      }
    }
    if (_t169.foldedLabel !== undefined) {
    if (typeof _t169.foldedLabel !== "string") errs.push(((p) + ".foldedLabel") + ": 期望 string，实收 " + typeof _t169.foldedLabel);
    }
  }
}
function chkNotifAction(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t177 = v as Record<string, unknown>;
    if (typeof _t177.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t177.label);
    if (_t177.isPrimary !== undefined) {
    if (!(_t177.isPrimary === false || _t177.isPrimary === true)) errs.push(((p) + ".isPrimary") + ": 期望 false|true");
    }
    if (_t177.command !== undefined) {
    if (typeof _t177.command !== "string") errs.push(((p) + ".command") + ": 期望 string，实收 " + typeof _t177.command);
    }
    if (_t177.args !== undefined) {
    if (!Array.isArray(_t177.args)) errs.push(((p) + ".args") + ": 期望数组");
    else {
      for (let _t178 = 0; _t178 < _t177.args.length; _t178++) {
      }
    }
    }
  }
}
function chkNotifItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t175 = v as Record<string, unknown>;
    if (typeof _t175.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t175.id);
    if (typeof _t175.iconClass !== "string") errs.push(((p) + ".iconClass") + ": 期望 string，实收 " + typeof _t175.iconClass);
    if (typeof _t175.message !== "string") errs.push(((p) + ".message") + ": 期望 string，实收 " + typeof _t175.message);
    if (typeof _t175.timeLabel !== "string") errs.push(((p) + ".timeLabel") + ": 期望 string，实收 " + typeof _t175.timeLabel);
    if (_t175.sourceLabel !== undefined) {
    if (typeof _t175.sourceLabel !== "string") errs.push(((p) + ".sourceLabel") + ": 期望 string，实收 " + typeof _t175.sourceLabel);
    }
    if (!Array.isArray(_t175.actions)) errs.push(((p) + ".actions") + ": 期望数组");
    else {
      for (let _t176 = 0; _t176 < _t175.actions.length; _t176++) {
          chkNotifAction(_t175.actions[_t176], (((p) + ".actions") + "[" + _t176 + "]"), errs);
      }
    }
    if (_t175.progress !== undefined) {
    if (!(_t175.progress === false || _t175.progress === true)) errs.push(((p) + ".progress") + ": 期望 false|true");
    }
    if (_t175.percent !== undefined) {
    if (typeof _t175.percent !== "number") errs.push(((p) + ".percent") + ": 期望 number，实收 " + typeof _t175.percent);
    }
    if (!(_t175.wake === false || _t175.wake === true)) errs.push(((p) + ".wake") + ": 期望 false|true");
    if (_t175.ttl !== undefined) {
    if (typeof _t175.ttl !== "number") errs.push(((p) + ".ttl") + ": 期望 number，实收 " + typeof _t175.ttl);
    }
    if (_t175.persistent !== undefined) {
    if (!(_t175.persistent === false || _t175.persistent === true)) errs.push(((p) + ".persistent") + ": 期望 false|true");
    }
  }
}
function chkNotifGroup(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t173 = v as Record<string, unknown>;
    if (typeof _t173.key !== "string") errs.push(((p) + ".key") + ": 期望 string，实收 " + typeof _t173.key);
    if (typeof _t173.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t173.label);
    if (typeof _t173.unread !== "number") errs.push(((p) + ".unread") + ": 期望 number，实收 " + typeof _t173.unread);
    if (!Array.isArray(_t173.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t174 = 0; _t174 < _t173.items.length; _t174++) {
          chkNotifItem(_t173.items[_t174], (((p) + ".items") + "[" + _t174 + "]"), errs);
      }
    }
    if (_t173.foldedLabel !== undefined) {
    if (typeof _t173.foldedLabel !== "string") errs.push(((p) + ".foldedLabel") + ": 期望 string，实收 " + typeof _t173.foldedLabel);
    }
  }
}
function chkNotifLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t167 = v as Record<string, unknown>;
    if (typeof _t167.unread !== "number") errs.push(((p) + ".unread") + ": 期望 number，实收 " + typeof _t167.unread);
    if (typeof _t167.bellTitle !== "string") errs.push(((p) + ".bellTitle") + ": 期望 string，实收 " + typeof _t167.bellTitle);
    if (typeof _t167.panelTitle !== "string") errs.push(((p) + ".panelTitle") + ": 期望 string，实收 " + typeof _t167.panelTitle);
    if (typeof _t167.clearLabel !== "string") errs.push(((p) + ".clearLabel") + ": 期望 string，实收 " + typeof _t167.clearLabel);
    if (typeof _t167.minimizeLabel !== "string") errs.push(((p) + ".minimizeLabel") + ": 期望 string，实收 " + typeof _t167.minimizeLabel);
    if (typeof _t167.emptyLabel !== "string") errs.push(((p) + ".emptyLabel") + ": 期望 string，实收 " + typeof _t167.emptyLabel);
    if (typeof _t167.dismissTitle !== "string") errs.push(((p) + ".dismissTitle") + ": 期望 string，实收 " + typeof _t167.dismissTitle);
    if (_t167.summaryLabel !== undefined) {
    if (typeof _t167.summaryLabel !== "string") errs.push(((p) + ".summaryLabel") + ": 期望 string，实收 " + typeof _t167.summaryLabel);
    }
    if (_t167.sections !== undefined) {
    if (!Array.isArray(_t167.sections)) errs.push(((p) + ".sections") + ": 期望数组");
    else {
      for (let _t168 = 0; _t168 < _t167.sections.length; _t168++) {
          chkNotifSection(_t167.sections[_t168], (((p) + ".sections") + "[" + _t168 + "]"), errs);
      }
    }
    }
    if (_t167.resultLabel !== undefined) {
    if (typeof _t167.resultLabel !== "string") errs.push(((p) + ".resultLabel") + ": 期望 string，实收 " + typeof _t167.resultLabel);
    }
    if (_t167.resultSummary !== undefined) {
    if (typeof _t167.resultSummary !== "string") errs.push(((p) + ".resultSummary") + ": 期望 string，实收 " + typeof _t167.resultSummary);
    }
    if (!Array.isArray(_t167.groups)) errs.push(((p) + ".groups") + ": 期望数组");
    else {
      for (let _t172 = 0; _t172 < _t167.groups.length; _t172++) {
          chkNotifGroup(_t167.groups[_t172], (((p) + ".groups") + "[" + _t172 + "]"), errs);
      }
    }
    if (_t167.autoOpen !== undefined) {
    if (!(_t167.autoOpen === false || _t167.autoOpen === true)) errs.push(((p) + ".autoOpen") + ": 期望 false|true");
    }
  }
}
function chkStatusBarLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t164 = v as Record<string, unknown>;
    if (!Array.isArray(_t164.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t165 = 0; _t165 < _t164.items.length; _t165++) {
          chkPoolStatusBarItem(_t164.items[_t165], (((p) + ".items") + "[" + _t165 + "]"), errs);
      }
    }
    if (_t164.chordLabel !== undefined) {
    if (typeof _t164.chordLabel !== "string") errs.push(((p) + ".chordLabel") + ": 期望 string，实收 " + typeof _t164.chordLabel);
    }
    chkNotifLayout(_t164.notif, ((p) + ".notif"), errs);
  }
}
function chkPoolCommandHints(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t179 = v as Record<string, unknown>;
    for (const _t180 of Object.keys(_t179)) {
    if (_t179[_t180] === null || typeof _t179[_t180] !== "object" || Array.isArray(_t179[_t180])) errs.push(((p) + "[\"" + _t180 + "\"]") + ": 期望 object");
    else {
      const _t181 = _t179[_t180] as Record<string, unknown>;
      if (typeof _t181.title !== "string") errs.push((((p) + "[\"" + _t180 + "\"]") + ".title") + ": 期望 string，实收 " + typeof _t181.title);
      if (_t181.keybinding !== undefined) {
      if (typeof _t181.keybinding !== "string") errs.push((((p) + "[\"" + _t180 + "\"]") + ".keybinding") + ": 期望 string，实收 " + typeof _t181.keybinding);
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
      for (let _t108 = 0; _t108 < _t51.groups.length; _t108++) {
          chkPoolGroup(_t51.groups[_t108], (((p) + ".groups") + "[" + _t108 + "]"), errs);
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
      for (let _t154 = 0; _t154 < _t51.creatableViews.length; _t154++) {
          chkCreatableViewMeta(_t51.creatableViews[_t154], (((p) + ".creatableViews") + "[" + _t154 + "]"), errs);
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
    const _t186 = v as Record<string, unknown>;
    if (typeof _t186.actionId !== "string") errs.push(((p) + ".actionId") + ": 期望 string，实收 " + typeof _t186.actionId);
    if (typeof _t186.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t186.icon);
    if (_t186.tooltip !== undefined) {
    if (typeof _t186.tooltip !== "string") errs.push(((p) + ".tooltip") + ": 期望 string，实收 " + typeof _t186.tooltip);
    }
  }
}
function chkPoolQuickPickItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t184 = v as Record<string, unknown>;
    if (typeof _t184.key !== "string") errs.push(((p) + ".key") + ": 期望 string，实收 " + typeof _t184.key);
    if (typeof _t184.searchText !== "string") errs.push(((p) + ".searchText") + ": 期望 string，实收 " + typeof _t184.searchText);
    if (_t184.checked !== undefined) {
    if (!(_t184.checked === false || _t184.checked === true)) errs.push(((p) + ".checked") + ": 期望 false|true");
    }
    if (typeof _t184.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t184.label);
    if (_t184.category !== undefined) {
    if (typeof _t184.category !== "string") errs.push(((p) + ".category") + ": 期望 string，实收 " + typeof _t184.category);
    }
    if (_t184.detail !== undefined) {
    if (typeof _t184.detail !== "string") errs.push(((p) + ".detail") + ": 期望 string，实收 " + typeof _t184.detail);
    }
    if (_t184.keybinding !== undefined) {
    if (typeof _t184.keybinding !== "string") errs.push(((p) + ".keybinding") + ": 期望 string，实收 " + typeof _t184.keybinding);
    }
    if (_t184.buttons !== undefined) {
    if (!Array.isArray(_t184.buttons)) errs.push(((p) + ".buttons") + ": 期望数组");
    else {
      for (let _t185 = 0; _t185 < _t184.buttons.length; _t185++) {
          chkPoolQuickPickButton(_t184.buttons[_t185], (((p) + ".buttons") + "[" + _t185 + "]"), errs);
      }
    }
    }
  }
}
function chkPoolQuickPickData(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t182 = v as Record<string, unknown>;
    if (!(_t182.open === false || _t182.open === true)) errs.push(((p) + ".open") + ": 期望 false|true");
    if (typeof _t182.placeholder !== "string") errs.push(((p) + ".placeholder") + ": 期望 string，实收 " + typeof _t182.placeholder);
    if (_t182.prefix !== undefined) {
    if (typeof _t182.prefix !== "string") errs.push(((p) + ".prefix") + ": 期望 string，实收 " + typeof _t182.prefix);
    }
    if (!Array.isArray(_t182.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t183 = 0; _t183 < _t182.items.length; _t183++) {
          chkPoolQuickPickItem(_t182.items[_t183], (((p) + ".items") + "[" + _t183 + "]"), errs);
      }
    }
  }
}
function chkPoolDialogData(v: unknown, p: string, errs: string[]): void {
  const _t187: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t187.push((p) + ": 期望 object");
    else {
      const _t188 = v as Record<string, unknown>;
      if (_t188.open !== false) _t187.push(((p) + ".open") + ": 期望 false");
    }
  const _t189 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).open === false ? 1 : 0)) : 0);
  if (_t187.length > 0) {
  const _t190: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t190.push((p) + ": 期望 object");
    else {
      const _t191 = v as Record<string, unknown>;
      if (_t191.open !== true) _t190.push(((p) + ".open") + ": 期望 true");
      if (typeof _t191.title !== "string") _t190.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t191.title);
      if (typeof _t191.message !== "string") _t190.push(((p) + ".message") + ": 期望 string，实收 " + typeof _t191.message);
      if (_t191.confirmLabel !== undefined) {
      if (typeof _t191.confirmLabel !== "string") _t190.push(((p) + ".confirmLabel") + ": 期望 string，实收 " + typeof _t191.confirmLabel);
      }
      if (_t191.cancelLabel !== undefined) {
      if (typeof _t191.cancelLabel !== "string") _t190.push(((p) + ".cancelLabel") + ": 期望 string，实收 " + typeof _t191.cancelLabel);
      }
      if (!(_t191.isAlert === false || _t191.isAlert === true)) _t190.push(((p) + ".isAlert") + ": 期望 false|true");
      if (_t191.content !== undefined) {
      if (_t191.content === null || typeof _t191.content !== "object" || Array.isArray(_t191.content)) _t190.push(((p) + ".content") + ": 期望 object");
      else {
        const _t192 = _t191.content as Record<string, unknown>;
        if (typeof _t192.pluginId !== "string") _t190.push((((p) + ".content") + ".pluginId") + ": 期望 string，实收 " + typeof _t192.pluginId);
        if (typeof _t192.renderPath !== "string") _t190.push((((p) + ".content") + ".renderPath") + ": 期望 string，实收 " + typeof _t192.renderPath);
        if (_t192.payload !== undefined) {
        }
      }
      }
    }
  const _t193 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).open === true ? 1 : 0) + (((v as Record<string, unknown>).isAlert === false) || ((v as Record<string, unknown>).isAlert === true) ? 1 : 0)) : 0);
  const _t194 = [{ e: _t187, s: _t189 }, { e: _t190, s: _t193 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t194.length > 0) errs.push(..._t194);
  }
}
function chkPoolFloatingPanelButton(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t201 = v as Record<string, unknown>;
    if (typeof _t201.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t201.id);
    if (typeof _t201.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t201.label);
    if (typeof _t201.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t201.icon);
    if (_t201.toggledIcon !== undefined) {
    if (typeof _t201.toggledIcon !== "string") errs.push(((p) + ".toggledIcon") + ": 期望 string，实收 " + typeof _t201.toggledIcon);
    }
    if (_t201.toggledLabel !== undefined) {
    if (typeof _t201.toggledLabel !== "string") errs.push(((p) + ".toggledLabel") + ": 期望 string，实收 " + typeof _t201.toggledLabel);
    }
    if (_t201.expandOnHover !== undefined) {
    if (!(_t201.expandOnHover === false || _t201.expandOnHover === true)) errs.push(((p) + ".expandOnHover") + ": 期望 false|true");
    }
  }
}
function chkPoolFloatingPanelData(v: unknown, p: string, errs: string[]): void {
  const _t195: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t195.push((p) + ": 期望 object");
    else {
      const _t196 = v as Record<string, unknown>;
      if (_t196.open !== false) _t195.push(((p) + ".open") + ": 期望 false");
    }
  const _t197 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).open === false ? 1 : 0)) : 0);
  if (_t195.length > 0) {
  const _t198: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t198.push((p) + ": 期望 object");
    else {
      const _t199 = v as Record<string, unknown>;
      if (_t199.open !== true) _t198.push(((p) + ".open") + ": 期望 true");
      if (typeof _t199.viewId !== "string") _t198.push(((p) + ".viewId") + ": 期望 string，实收 " + typeof _t199.viewId);
      if (typeof _t199.title !== "string") _t198.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t199.title);
      if (typeof _t199.pluginId !== "string") _t198.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t199.pluginId);
      if (typeof _t199.renderPath !== "string") _t198.push(((p) + ".renderPath") + ": 期望 string，实收 " + typeof _t199.renderPath);
      if (!Array.isArray(_t199.actions)) _t198.push(((p) + ".actions") + ": 期望数组");
      else {
        for (let _t200 = 0; _t200 < _t199.actions.length; _t200++) {
            chkPoolFloatingPanelButton(_t199.actions[_t200], (((p) + ".actions") + "[" + _t200 + "]"), _t198);
        }
      }
      if (_t199.refresh !== undefined) {
      if (!(_t199.refresh === false || _t199.refresh === true)) _t198.push(((p) + ".refresh") + ": 期望 false|true");
      }
      if (_t199.bounds !== undefined) {
      const _t202: string[] = [];
        if (_t199.bounds !== null) _t202.push(((p) + ".bounds") + ": 期望 null");
      const _t203 = 0;
      if (_t202.length > 0) {
      const _t204: string[] = [];
        if (_t199.bounds === null || typeof _t199.bounds !== "object" || Array.isArray(_t199.bounds)) _t204.push(((p) + ".bounds") + ": 期望 object");
        else {
          const _t205 = _t199.bounds as Record<string, unknown>;
          if (_t205.top !== undefined) {
          if (typeof _t205.top !== "number") _t204.push((((p) + ".bounds") + ".top") + ": 期望 number，实收 " + typeof _t205.top);
          }
          if (_t205.left !== undefined) {
          if (typeof _t205.left !== "number") _t204.push((((p) + ".bounds") + ".left") + ": 期望 number，实收 " + typeof _t205.left);
          }
          if (_t205.width !== undefined) {
          if (typeof _t205.width !== "number") _t204.push((((p) + ".bounds") + ".width") + ": 期望 number，实收 " + typeof _t205.width);
          }
          if (_t205.height !== undefined) {
          if (typeof _t205.height !== "number") _t204.push((((p) + ".bounds") + ".height") + ": 期望 number，实收 " + typeof _t205.height);
          }
        }
      const _t206 = 0;
      const _t207 = [{ e: _t202, s: _t203 }, { e: _t204, s: _t206 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
      if (_t207.length > 0) _t198.push(..._t207);
      }
      }
    }
  const _t208 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).open === true ? 1 : 0) + (((v as Record<string, unknown>).refresh === false) || ((v as Record<string, unknown>).refresh === true) ? 1 : 0)) : 0);
  const _t209 = [{ e: _t195, s: _t197 }, { e: _t198, s: _t208 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t209.length > 0) errs.push(..._t209);
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
