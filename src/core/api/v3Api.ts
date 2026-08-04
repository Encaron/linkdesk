/**
 * Phase 5h: window.__v3_core__ API — runtime plugin SDK surface.
 *
 * Runtime plugins (independently built, loaded via plugin:// protocol)
 * access core singletons through this global namespace. Only modules that
 * MUST be the same instance as core are exposed here:
 *   - Registry functions (registerCommand, etc.) — singleton registries
 *   - Hooks that use React context — must share React instance
 *   - ConfigurationService — singleton state
 *
 * Everything else (components, utilities, types) can be bundled into the
 * plugin — they're stateless code, duplicate copies don't matter.
 *
 * Design: [[core-ignorance-principle]] — the core doesn't know what
 * plugins do, but plugins need a way to call core registries.
 * This is the narrowest possible API surface for that.
 *
 * VS Code equivalent: vscode namespace (but much smaller — no sandbox).
 */

import React from "react";
import { registerCommand } from "../registry/CommandRegistry";
import { registerMenuItems } from "../registry/MenuRegistry";
import { registerKeybinding } from "../registry/KeybindingRegistry";
import { registerConfiguration, unregisterConfiguration, registerConfigurationDefaults, unregisterConfigurationDefaults } from "../registry/ConfigurationRegistry";
import { useConfiguration, useConfigurationValue } from "../react/useConfiguration";
import { getConfigurationValue, setConfigurationValue, onDidChangeConfiguration } from "../services/ConfigurationService";
import { useSendData } from "../react/useSendData";
import { useIpcEvent } from "../../hooks/useIpcEvent";
import { useSourceState } from "../react/SourceStateContext";

/** The V3 runtime plugin API surface. Exposed as window.__v3_core__. */
const v3Api = {
  // --- React (must be singleton for hooks to work) ---
  React,

  // --- Registry functions (core singletons) ---
  registerCommand,
  registerMenuItems,
  registerKeybinding,
  registerConfiguration,
  unregisterConfiguration,
  registerConfigurationDefaults,
  unregisterConfigurationDefaults,

  // --- Hooks (depend on React context — must share React instance) ---
  useConfiguration,
  useConfigurationValue,
  useSendData,
  useIpcEvent,
  useSourceState,

  // --- Configuration service (singleton state) ---
  getConfigurationValue,
  setConfigurationValue,
  onDidChangeConfiguration,
};

export default v3Api;
export type V3Api = typeof v3Api;

/** Initialize the window.__v3_core__ global. Called once at app startup. */
export function initV3Api(): void {
  (window as any).__v3_core__ = v3Api;
}
