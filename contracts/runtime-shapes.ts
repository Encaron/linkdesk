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
      if (_t114.banner !== undefined) {
      if (typeof _t114.banner !== "string") _t113.push(((p) + ".banner") + ": 期望 string，实收 " + typeof _t114.banner);
      }
    }
  const _t117 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).state === "content" ? 1 : 0)) : 0);
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
    const _t128 = v as Record<string, unknown>;
    if (typeof _t128.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t128.label);
    if (typeof _t128.value !== "string") errs.push(((p) + ".value") + ": 期望 string，实收 " + typeof _t128.value);
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
      if (!Array.isArray(_t126.fields)) _t125.push(((p) + ".fields") + ": 期望数组");
      else {
        for (let _t127 = 0; _t127 < _t126.fields.length; _t127++) {
            chkPoolAboutField(_t126.fields[_t127], (((p) + ".fields") + "[" + _t127 + "]"), _t125);
        }
      }
    }
  const _t129 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).state === "content" ? 1 : 0)) : 0);
  const _t130 = [{ e: _t122, s: _t124 }, { e: _t125, s: _t129 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t130.length > 0) errs.push(..._t130);
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
  const _t131: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t131.push((p) + ": 期望 object");
    else {
      const _t132 = v as Record<string, unknown>;
      if (_t132.type !== "leaf") _t131.push(((p) + ".type") + ": 期望 leaf");
      if (typeof _t132.groupId !== "string") _t131.push(((p) + ".groupId") + ": 期望 string，实收 " + typeof _t132.groupId);
    }
  const _t133 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "leaf" ? 1 : 0)) : 0);
  if (_t131.length > 0) {
  const _t134: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t134.push((p) + ": 期望 object");
    else {
      const _t135 = v as Record<string, unknown>;
      if (_t135.type !== "branch") _t134.push(((p) + ".type") + ": 期望 branch");
      if (!(_t135.direction === "horizontal" || _t135.direction === "vertical")) _t134.push(((p) + ".direction") + ": 期望 horizontal|vertical");
      if (!Array.isArray(_t135.children)) _t134.push(((p) + ".children") + ": 期望数组");
      else {
        if (_t135.children.length !== 2) _t134.push(((p) + ".children") + ": 期望长度 2");
          chkSplitNode(_t135.children[0], (((p) + ".children") + "[0]"), _t134);
          chkSplitNode(_t135.children[1], (((p) + ".children") + "[1]"), _t134);
      }
      if (!Array.isArray(_t135.sizes)) _t134.push(((p) + ".sizes") + ": 期望数组");
      else {
        if (_t135.sizes.length !== 2) _t134.push(((p) + ".sizes") + ": 期望长度 2");
          if (typeof _t135.sizes[0] !== "number") _t134.push((((p) + ".sizes") + "[0]") + ": 期望 number，实收 " + typeof _t135.sizes[0]);
          if (typeof _t135.sizes[1] !== "number") _t134.push((((p) + ".sizes") + "[1]") + ": 期望 number，实收 " + typeof _t135.sizes[1]);
      }
    }
  const _t136 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).type === "branch" ? 1 : 0) + (((v as Record<string, unknown>).direction === "horizontal") || ((v as Record<string, unknown>).direction === "vertical") ? 1 : 0)) : 0);
  const _t137 = [{ e: _t131, s: _t133 }, { e: _t134, s: _t136 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t137.length > 0) errs.push(..._t137);
  }
}
function chkCreatableViewMeta(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t139 = v as Record<string, unknown>;
    if (typeof _t139.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t139.pluginId);
    if (typeof _t139.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t139.label);
  }
}
function chkPanelViewMeta(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t142 = v as Record<string, unknown>;
    if (typeof _t142.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t142.id);
    if (typeof _t142.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t142.title);
    if (typeof _t142.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t142.pluginId);
    if (typeof _t142.renderPath !== "string") errs.push(((p) + ".renderPath") + ": 期望 string，实收 " + typeof _t142.renderPath);
    if (_t142.titleActions !== undefined) {
    if (!Array.isArray(_t142.titleActions)) errs.push(((p) + ".titleActions") + ": 期望数组");
    else {
      for (let _t143 = 0; _t143 < _t142.titleActions.length; _t143++) {
          chkTitleActionWidget(_t142.titleActions[_t143], (((p) + ".titleActions") + "[" + _t143 + "]"), errs);
      }
    }
    }
  }
}
function chkPanelSwitcherItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t147 = v as Record<string, unknown>;
    if (typeof _t147.viewId !== "string") errs.push(((p) + ".viewId") + ": 期望 string，实收 " + typeof _t147.viewId);
    if (typeof _t147.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t147.title);
    if (typeof _t147.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t147.pluginId);
    if (!(_t147.visible === false || _t147.visible === true)) errs.push(((p) + ".visible") + ": 期望 false|true");
    if (!(_t147.active === false || _t147.active === true)) errs.push(((p) + ".active") + ": 期望 false|true");
  }
}
function chkPanelSwitcherGroup(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t145 = v as Record<string, unknown>;
    if (typeof _t145.containerId !== "string") errs.push(((p) + ".containerId") + ": 期望 string，实收 " + typeof _t145.containerId);
    if (typeof _t145.containerTitle !== "string") errs.push(((p) + ".containerTitle") + ": 期望 string，实收 " + typeof _t145.containerTitle);
    if (!Array.isArray(_t145.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t146 = 0; _t146 < _t145.items.length; _t146++) {
          chkPanelSwitcherItem(_t145.items[_t146], (((p) + ".items") + "[" + _t146 + "]"), errs);
      }
    }
  }
}
function chkPanelLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t140 = v as Record<string, unknown>;
    if (!(_t140.visible === false || _t140.visible === true)) errs.push(((p) + ".visible") + ": 期望 false|true");
    if (typeof _t140.height !== "number") errs.push(((p) + ".height") + ": 期望 number，实收 " + typeof _t140.height);
    if (_t140.edge !== undefined) {
    if (!(_t140.edge === "top" || _t140.edge === "bottom" || _t140.edge === "left" || _t140.edge === "right")) errs.push(((p) + ".edge") + ": 期望 top|bottom|left|right");
    }
    if (_t140.align !== undefined) {
    if (!(_t140.align === "left" || _t140.align === "right" || _t140.align === "center" || _t140.align === "justify")) errs.push(((p) + ".align") + ": 期望 left|right|center|justify");
    }
    if (_t140.width !== undefined) {
    if (typeof _t140.width !== "number") errs.push(((p) + ".width") + ": 期望 number，实收 " + typeof _t140.width);
    }
    if (typeof _t140.activeViewId !== "string") errs.push(((p) + ".activeViewId") + ": 期望 string，实收 " + typeof _t140.activeViewId);
    if (!Array.isArray(_t140.views)) errs.push(((p) + ".views") + ": 期望数组");
    else {
      for (let _t141 = 0; _t141 < _t140.views.length; _t141++) {
          chkPanelViewMeta(_t140.views[_t141], (((p) + ".views") + "[" + _t141 + "]"), errs);
      }
    }
    if (_t140.minHeight !== undefined) {
    if (typeof _t140.minHeight !== "number") errs.push(((p) + ".minHeight") + ": 期望 number，实收 " + typeof _t140.minHeight);
    }
    if (_t140.maxHeight !== undefined) {
    if (typeof _t140.maxHeight !== "number") errs.push(((p) + ".maxHeight") + ": 期望 number，实收 " + typeof _t140.maxHeight);
    }
    if (_t140.minWidth !== undefined) {
    if (typeof _t140.minWidth !== "number") errs.push(((p) + ".minWidth") + ": 期望 number，实收 " + typeof _t140.minWidth);
    }
    if (_t140.maxWidth !== undefined) {
    if (typeof _t140.maxWidth !== "number") errs.push(((p) + ".maxWidth") + ": 期望 number，实收 " + typeof _t140.maxWidth);
    }
    if (_t140.createTooltip !== undefined) {
    if (typeof _t140.createTooltip !== "string") errs.push(((p) + ".createTooltip") + ": 期望 string，实收 " + typeof _t140.createTooltip);
    }
    if (_t140.switcher !== undefined) {
    if (!Array.isArray(_t140.switcher)) errs.push(((p) + ".switcher") + ": 期望数组");
    else {
      for (let _t144 = 0; _t144 < _t140.switcher.length; _t144++) {
          chkPanelSwitcherGroup(_t140.switcher[_t144], (((p) + ".switcher") + "[" + _t144 + "]"), errs);
      }
    }
    }
    if (_t140.emptyText !== undefined) {
    if (typeof _t140.emptyText !== "string") errs.push(((p) + ".emptyText") + ": 期望 string，实收 " + typeof _t140.emptyText);
    }
    if (_t140.emptyHint !== undefined) {
    if (typeof _t140.emptyHint !== "string") errs.push(((p) + ".emptyHint") + ": 期望 string，实收 " + typeof _t140.emptyHint);
    }
    if (_t140.detachable !== undefined) {
    if (!(_t140.detachable === false || _t140.detachable === true)) errs.push(((p) + ".detachable") + ": 期望 false|true");
    }
    if (_t140.detachTooltip !== undefined) {
    if (typeof _t140.detachTooltip !== "string") errs.push(((p) + ".detachTooltip") + ": 期望 string，实收 " + typeof _t140.detachTooltip);
    }
  }
}
function chkPoolStatusBarItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t150 = v as Record<string, unknown>;
    if (typeof _t150.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t150.id);
    if (typeof _t150.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t150.pluginId);
    if (_t150.icon !== undefined) {
    if (typeof _t150.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t150.icon);
    }
    if (typeof _t150.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t150.label);
    if (_t150.title !== undefined) {
    if (typeof _t150.title !== "string") errs.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t150.title);
    }
    if (!(_t150.align === "left" || _t150.align === "right")) errs.push(((p) + ".align") + ": 期望 left|right");
    if (_t150.onClick !== undefined) {
    if (typeof _t150.onClick !== "string") errs.push(((p) + ".onClick") + ": 期望 string，实收 " + typeof _t150.onClick);
    }
    if (_t150.componentRenderPath !== undefined) {
    if (typeof _t150.componentRenderPath !== "string") errs.push(((p) + ".componentRenderPath") + ": 期望 string，实收 " + typeof _t150.componentRenderPath);
    }
    if (_t150.dividerBefore !== undefined) {
    if (!(_t150.dividerBefore === false || _t150.dividerBefore === true)) errs.push(((p) + ".dividerBefore") + ": 期望 false|true");
    }
  }
}
function chkNotifJobRow(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t155 = v as Record<string, unknown>;
    if (typeof _t155.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t155.id);
    if (typeof _t155.pluginId !== "string") errs.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t155.pluginId);
    if (typeof _t155.name !== "string") errs.push(((p) + ".name") + ": 期望 string，实收 " + typeof _t155.name);
    if (typeof _t155.iconClass !== "string") errs.push(((p) + ".iconClass") + ": 期望 string，实收 " + typeof _t155.iconClass);
    if (typeof _t155.statusLabel !== "string") errs.push(((p) + ".statusLabel") + ": 期望 string，实收 " + typeof _t155.statusLabel);
    if (_t155.percent !== undefined) {
    if (typeof _t155.percent !== "number") errs.push(((p) + ".percent") + ": 期望 number，实收 " + typeof _t155.percent);
    }
    if (_t155.cancellable !== undefined) {
    if (!(_t155.cancellable === false || _t155.cancellable === true)) errs.push(((p) + ".cancellable") + ": 期望 false|true");
    }
    if (_t155.cancelLabel !== undefined) {
    if (typeof _t155.cancelLabel !== "string") errs.push(((p) + ".cancelLabel") + ": 期望 string，实收 " + typeof _t155.cancelLabel);
    }
  }
}
function chkNotifSection(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t153 = v as Record<string, unknown>;
    if (typeof _t153.key !== "string") errs.push(((p) + ".key") + ": 期望 string，实收 " + typeof _t153.key);
    if (typeof _t153.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t153.label);
    if (!Array.isArray(_t153.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t154 = 0; _t154 < _t153.items.length; _t154++) {
          chkNotifJobRow(_t153.items[_t154], (((p) + ".items") + "[" + _t154 + "]"), errs);
      }
    }
    if (_t153.foldedLabel !== undefined) {
    if (typeof _t153.foldedLabel !== "string") errs.push(((p) + ".foldedLabel") + ": 期望 string，实收 " + typeof _t153.foldedLabel);
    }
  }
}
function chkNotifAction(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t161 = v as Record<string, unknown>;
    if (typeof _t161.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t161.label);
    if (_t161.isPrimary !== undefined) {
    if (!(_t161.isPrimary === false || _t161.isPrimary === true)) errs.push(((p) + ".isPrimary") + ": 期望 false|true");
    }
  }
}
function chkNotifItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t159 = v as Record<string, unknown>;
    if (typeof _t159.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t159.id);
    if (typeof _t159.iconClass !== "string") errs.push(((p) + ".iconClass") + ": 期望 string，实收 " + typeof _t159.iconClass);
    if (typeof _t159.message !== "string") errs.push(((p) + ".message") + ": 期望 string，实收 " + typeof _t159.message);
    if (typeof _t159.timeLabel !== "string") errs.push(((p) + ".timeLabel") + ": 期望 string，实收 " + typeof _t159.timeLabel);
    if (_t159.sourceLabel !== undefined) {
    if (typeof _t159.sourceLabel !== "string") errs.push(((p) + ".sourceLabel") + ": 期望 string，实收 " + typeof _t159.sourceLabel);
    }
    if (!Array.isArray(_t159.actions)) errs.push(((p) + ".actions") + ": 期望数组");
    else {
      for (let _t160 = 0; _t160 < _t159.actions.length; _t160++) {
          chkNotifAction(_t159.actions[_t160], (((p) + ".actions") + "[" + _t160 + "]"), errs);
      }
    }
    if (_t159.progress !== undefined) {
    if (!(_t159.progress === false || _t159.progress === true)) errs.push(((p) + ".progress") + ": 期望 false|true");
    }
    if (_t159.percent !== undefined) {
    if (typeof _t159.percent !== "number") errs.push(((p) + ".percent") + ": 期望 number，实收 " + typeof _t159.percent);
    }
  }
}
function chkNotifGroup(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t157 = v as Record<string, unknown>;
    if (typeof _t157.key !== "string") errs.push(((p) + ".key") + ": 期望 string，实收 " + typeof _t157.key);
    if (typeof _t157.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t157.label);
    if (typeof _t157.unread !== "number") errs.push(((p) + ".unread") + ": 期望 number，实收 " + typeof _t157.unread);
    if (!Array.isArray(_t157.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t158 = 0; _t158 < _t157.items.length; _t158++) {
          chkNotifItem(_t157.items[_t158], (((p) + ".items") + "[" + _t158 + "]"), errs);
      }
    }
    if (_t157.foldedLabel !== undefined) {
    if (typeof _t157.foldedLabel !== "string") errs.push(((p) + ".foldedLabel") + ": 期望 string，实收 " + typeof _t157.foldedLabel);
    }
  }
}
function chkNotifLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t151 = v as Record<string, unknown>;
    if (typeof _t151.unread !== "number") errs.push(((p) + ".unread") + ": 期望 number，实收 " + typeof _t151.unread);
    if (typeof _t151.bellTitle !== "string") errs.push(((p) + ".bellTitle") + ": 期望 string，实收 " + typeof _t151.bellTitle);
    if (typeof _t151.panelTitle !== "string") errs.push(((p) + ".panelTitle") + ": 期望 string，实收 " + typeof _t151.panelTitle);
    if (typeof _t151.clearLabel !== "string") errs.push(((p) + ".clearLabel") + ": 期望 string，实收 " + typeof _t151.clearLabel);
    if (typeof _t151.minimizeLabel !== "string") errs.push(((p) + ".minimizeLabel") + ": 期望 string，实收 " + typeof _t151.minimizeLabel);
    if (typeof _t151.emptyLabel !== "string") errs.push(((p) + ".emptyLabel") + ": 期望 string，实收 " + typeof _t151.emptyLabel);
    if (typeof _t151.dismissTitle !== "string") errs.push(((p) + ".dismissTitle") + ": 期望 string，实收 " + typeof _t151.dismissTitle);
    if (_t151.summaryLabel !== undefined) {
    if (typeof _t151.summaryLabel !== "string") errs.push(((p) + ".summaryLabel") + ": 期望 string，实收 " + typeof _t151.summaryLabel);
    }
    if (_t151.sections !== undefined) {
    if (!Array.isArray(_t151.sections)) errs.push(((p) + ".sections") + ": 期望数组");
    else {
      for (let _t152 = 0; _t152 < _t151.sections.length; _t152++) {
          chkNotifSection(_t151.sections[_t152], (((p) + ".sections") + "[" + _t152 + "]"), errs);
      }
    }
    }
    if (_t151.resultLabel !== undefined) {
    if (typeof _t151.resultLabel !== "string") errs.push(((p) + ".resultLabel") + ": 期望 string，实收 " + typeof _t151.resultLabel);
    }
    if (_t151.resultSummary !== undefined) {
    if (typeof _t151.resultSummary !== "string") errs.push(((p) + ".resultSummary") + ": 期望 string，实收 " + typeof _t151.resultSummary);
    }
    if (!Array.isArray(_t151.groups)) errs.push(((p) + ".groups") + ": 期望数组");
    else {
      for (let _t156 = 0; _t156 < _t151.groups.length; _t156++) {
          chkNotifGroup(_t151.groups[_t156], (((p) + ".groups") + "[" + _t156 + "]"), errs);
      }
    }
    if (_t151.autoOpen !== undefined) {
    if (!(_t151.autoOpen === false || _t151.autoOpen === true)) errs.push(((p) + ".autoOpen") + ": 期望 false|true");
    }
  }
}
function chkStatusBarLayout(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t148 = v as Record<string, unknown>;
    if (!Array.isArray(_t148.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t149 = 0; _t149 < _t148.items.length; _t149++) {
          chkPoolStatusBarItem(_t148.items[_t149], (((p) + ".items") + "[" + _t149 + "]"), errs);
      }
    }
    if (_t148.chordLabel !== undefined) {
    if (typeof _t148.chordLabel !== "string") errs.push(((p) + ".chordLabel") + ": 期望 string，实收 " + typeof _t148.chordLabel);
    }
    chkNotifLayout(_t148.notif, ((p) + ".notif"), errs);
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
      for (let _t138 = 0; _t138 < _t51.creatableViews.length; _t138++) {
          chkCreatableViewMeta(_t51.creatableViews[_t138], (((p) + ".creatableViews") + "[" + _t138 + "]"), errs);
      }
    }
    }
    if (_t51.panel !== undefined) {
    chkPanelLayout(_t51.panel, ((p) + ".panel"), errs);
    }
    if (_t51.statusBar !== undefined) {
    chkStatusBarLayout(_t51.statusBar, ((p) + ".statusBar"), errs);
    }
  }
}
function chkPoolQuickPickButton(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t166 = v as Record<string, unknown>;
    if (typeof _t166.actionId !== "string") errs.push(((p) + ".actionId") + ": 期望 string，实收 " + typeof _t166.actionId);
    if (typeof _t166.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t166.icon);
    if (_t166.tooltip !== undefined) {
    if (typeof _t166.tooltip !== "string") errs.push(((p) + ".tooltip") + ": 期望 string，实收 " + typeof _t166.tooltip);
    }
  }
}
function chkPoolQuickPickItem(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t164 = v as Record<string, unknown>;
    if (typeof _t164.key !== "string") errs.push(((p) + ".key") + ": 期望 string，实收 " + typeof _t164.key);
    if (typeof _t164.searchText !== "string") errs.push(((p) + ".searchText") + ": 期望 string，实收 " + typeof _t164.searchText);
    if (_t164.checked !== undefined) {
    if (!(_t164.checked === false || _t164.checked === true)) errs.push(((p) + ".checked") + ": 期望 false|true");
    }
    if (typeof _t164.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t164.label);
    if (_t164.category !== undefined) {
    if (typeof _t164.category !== "string") errs.push(((p) + ".category") + ": 期望 string，实收 " + typeof _t164.category);
    }
    if (_t164.detail !== undefined) {
    if (typeof _t164.detail !== "string") errs.push(((p) + ".detail") + ": 期望 string，实收 " + typeof _t164.detail);
    }
    if (_t164.keybinding !== undefined) {
    if (typeof _t164.keybinding !== "string") errs.push(((p) + ".keybinding") + ": 期望 string，实收 " + typeof _t164.keybinding);
    }
    if (_t164.buttons !== undefined) {
    if (!Array.isArray(_t164.buttons)) errs.push(((p) + ".buttons") + ": 期望数组");
    else {
      for (let _t165 = 0; _t165 < _t164.buttons.length; _t165++) {
          chkPoolQuickPickButton(_t164.buttons[_t165], (((p) + ".buttons") + "[" + _t165 + "]"), errs);
      }
    }
    }
  }
}
function chkPoolQuickPickData(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t162 = v as Record<string, unknown>;
    if (!(_t162.open === false || _t162.open === true)) errs.push(((p) + ".open") + ": 期望 false|true");
    if (typeof _t162.placeholder !== "string") errs.push(((p) + ".placeholder") + ": 期望 string，实收 " + typeof _t162.placeholder);
    if (_t162.prefix !== undefined) {
    if (typeof _t162.prefix !== "string") errs.push(((p) + ".prefix") + ": 期望 string，实收 " + typeof _t162.prefix);
    }
    if (!Array.isArray(_t162.items)) errs.push(((p) + ".items") + ": 期望数组");
    else {
      for (let _t163 = 0; _t163 < _t162.items.length; _t163++) {
          chkPoolQuickPickItem(_t162.items[_t163], (((p) + ".items") + "[" + _t163 + "]"), errs);
      }
    }
  }
}
function chkPoolDialogData(v: unknown, p: string, errs: string[]): void {
  const _t167: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t167.push((p) + ": 期望 object");
    else {
      const _t168 = v as Record<string, unknown>;
      if (_t168.open !== false) _t167.push(((p) + ".open") + ": 期望 false");
    }
  const _t169 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).open === false ? 1 : 0)) : 0);
  if (_t167.length > 0) {
  const _t170: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t170.push((p) + ": 期望 object");
    else {
      const _t171 = v as Record<string, unknown>;
      if (_t171.open !== true) _t170.push(((p) + ".open") + ": 期望 true");
      if (typeof _t171.title !== "string") _t170.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t171.title);
      if (typeof _t171.message !== "string") _t170.push(((p) + ".message") + ": 期望 string，实收 " + typeof _t171.message);
      if (_t171.confirmLabel !== undefined) {
      if (typeof _t171.confirmLabel !== "string") _t170.push(((p) + ".confirmLabel") + ": 期望 string，实收 " + typeof _t171.confirmLabel);
      }
      if (_t171.cancelLabel !== undefined) {
      if (typeof _t171.cancelLabel !== "string") _t170.push(((p) + ".cancelLabel") + ": 期望 string，实收 " + typeof _t171.cancelLabel);
      }
      if (!(_t171.isAlert === false || _t171.isAlert === true)) _t170.push(((p) + ".isAlert") + ": 期望 false|true");
      if (_t171.content !== undefined) {
      if (_t171.content === null || typeof _t171.content !== "object" || Array.isArray(_t171.content)) _t170.push(((p) + ".content") + ": 期望 object");
      else {
        const _t172 = _t171.content as Record<string, unknown>;
        if (typeof _t172.pluginId !== "string") _t170.push((((p) + ".content") + ".pluginId") + ": 期望 string，实收 " + typeof _t172.pluginId);
        if (typeof _t172.renderPath !== "string") _t170.push((((p) + ".content") + ".renderPath") + ": 期望 string，实收 " + typeof _t172.renderPath);
        if (_t172.payload !== undefined) {
        }
      }
      }
    }
  const _t173 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).open === true ? 1 : 0) + (((v as Record<string, unknown>).isAlert === false) || ((v as Record<string, unknown>).isAlert === true) ? 1 : 0)) : 0);
  const _t174 = [{ e: _t167, s: _t169 }, { e: _t170, s: _t173 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t174.length > 0) errs.push(..._t174);
  }
}
function chkPoolFloatingPanelButton(v: unknown, p: string, errs: string[]): void {
  if (v === null || typeof v !== "object" || Array.isArray(v)) errs.push((p) + ": 期望 object");
  else {
    const _t181 = v as Record<string, unknown>;
    if (typeof _t181.id !== "string") errs.push(((p) + ".id") + ": 期望 string，实收 " + typeof _t181.id);
    if (typeof _t181.label !== "string") errs.push(((p) + ".label") + ": 期望 string，实收 " + typeof _t181.label);
    if (typeof _t181.icon !== "string") errs.push(((p) + ".icon") + ": 期望 string，实收 " + typeof _t181.icon);
    if (_t181.toggledIcon !== undefined) {
    if (typeof _t181.toggledIcon !== "string") errs.push(((p) + ".toggledIcon") + ": 期望 string，实收 " + typeof _t181.toggledIcon);
    }
    if (_t181.toggledLabel !== undefined) {
    if (typeof _t181.toggledLabel !== "string") errs.push(((p) + ".toggledLabel") + ": 期望 string，实收 " + typeof _t181.toggledLabel);
    }
    if (_t181.expandOnHover !== undefined) {
    if (!(_t181.expandOnHover === false || _t181.expandOnHover === true)) errs.push(((p) + ".expandOnHover") + ": 期望 false|true");
    }
  }
}
function chkPoolFloatingPanelData(v: unknown, p: string, errs: string[]): void {
  const _t175: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t175.push((p) + ": 期望 object");
    else {
      const _t176 = v as Record<string, unknown>;
      if (_t176.open !== false) _t175.push(((p) + ".open") + ": 期望 false");
    }
  const _t177 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).open === false ? 1 : 0)) : 0);
  if (_t175.length > 0) {
  const _t178: string[] = [];
    if (v === null || typeof v !== "object" || Array.isArray(v)) _t178.push((p) + ": 期望 object");
    else {
      const _t179 = v as Record<string, unknown>;
      if (_t179.open !== true) _t178.push(((p) + ".open") + ": 期望 true");
      if (typeof _t179.viewId !== "string") _t178.push(((p) + ".viewId") + ": 期望 string，实收 " + typeof _t179.viewId);
      if (typeof _t179.title !== "string") _t178.push(((p) + ".title") + ": 期望 string，实收 " + typeof _t179.title);
      if (typeof _t179.pluginId !== "string") _t178.push(((p) + ".pluginId") + ": 期望 string，实收 " + typeof _t179.pluginId);
      if (typeof _t179.renderPath !== "string") _t178.push(((p) + ".renderPath") + ": 期望 string，实收 " + typeof _t179.renderPath);
      if (!Array.isArray(_t179.actions)) _t178.push(((p) + ".actions") + ": 期望数组");
      else {
        for (let _t180 = 0; _t180 < _t179.actions.length; _t180++) {
            chkPoolFloatingPanelButton(_t179.actions[_t180], (((p) + ".actions") + "[" + _t180 + "]"), _t178);
        }
      }
      if (_t179.refresh !== undefined) {
      if (!(_t179.refresh === false || _t179.refresh === true)) _t178.push(((p) + ".refresh") + ": 期望 false|true");
      }
    }
  const _t182 = (v !== null && typeof v === "object" && !Array.isArray(v) ? (((v as Record<string, unknown>).open === true ? 1 : 0) + (((v as Record<string, unknown>).refresh === false) || ((v as Record<string, unknown>).refresh === true) ? 1 : 0)) : 0);
  const _t183 = [{ e: _t175, s: _t177 }, { e: _t178, s: _t182 }].sort((a, b) => b.s - a.s || a.e.length - b.e.length)[0].e;
  if (_t183.length > 0) errs.push(..._t183);
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
