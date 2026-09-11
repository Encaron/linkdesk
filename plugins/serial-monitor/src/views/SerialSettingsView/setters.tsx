/**
 * 表单读写接线——E6#87b 从 views/SerialSettingsView.tsx 搬出（只搬不改）。
 * 「从 activeSession 读 / 通过 updateSession 写」三件套 + 分组组件共用的形式。
 *
 * 一字不改从 sidebar.tsx L248-285 搬出。
 */

import { useCallback } from "react";
import type { ReactNode } from "react";
import { SelectBox, Toggle } from "@linkdesk/ui"; // E6#54c：共享控件走 @linkdesk/ui
import type { SerialSession } from "../../hooks/useSerialSessions";

export interface SessionFormApi {
  mkSetter: <K extends keyof SerialSession>(key: K) => (value: SerialSession[K]) => void;
  mkToggle: (key: keyof SerialSession) => ReactNode;
  mkSelect: (key: keyof SerialSession, options: string[] | { value: string; label: string }[]) => ReactNode;
}

export function useSessionSetters(
  activeSession: SerialSession | null,
  activeSessionId: string | null,
  updateSession: (id: string, patch: Partial<SerialSession>) => void,
): SessionFormApi {
  const mkSetter = useCallback(
    <K extends keyof SerialSession>(key: K) =>
      (value: SerialSession[K]) => {
        if (activeSessionId) {
          updateSession(activeSessionId, { [key]: value } as Partial<SerialSession>);
        }
      },
    [activeSessionId, updateSession],
  );

  const mkToggle = useCallback(
    (key: keyof SerialSession) => {
      const value = activeSession?.[key];
      const setter = mkSetter(key);
      return (
        <Toggle
          checked={Boolean(value)}
          onChange={(v) => setter(v as SerialSession[typeof key])}
        />
      );
    },
    [activeSession, mkSetter],
  );

  const mkSelect = useCallback(
    (key: keyof SerialSession, options: string[] | { value: string; label: string }[]) => {
      const value = activeSession?.[key];
      const setter = mkSetter(key);
      return (
        <SelectBox
          value={String(value ?? "")}
          options={options}
          onChange={(v) => setter(v as SerialSession[typeof key])}
        />
      );
    },
    [activeSession, mkSetter],
  );

  return { mkSetter, mkToggle, mkSelect };
}
