/**
 * @vitest-environment jsdom
 * useSerialSessions——模块级单例 hook。
 * Phase 5.5c Bug Fix：验证 createSession 对空字符串 ID 的防御处理。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSerialSessions, getActiveSessionId, getSessionById } from "../hooks/useSerialSessions";

describe("useSerialSessions", () => {
  beforeEach(() => {
    // 每个测试前重置模块级状态
    const { result } = renderHook(() => useSerialSessions());
    act(() => { result.current.resetAll(); });
  });

  describe("createSession", () => {
    it("空字符串 id 应自动生成有效 ID——不产生 falsy session.id", () => {
      const { result } = renderHook(() => useSerialSessions());

      act(() => {
        result.current.createSession("测试", "");
      });

      const session = result.current.activeSession;
      expect(session).not.toBeNull();
      expect(session!.id).toBeTruthy();           // 不是空串
      expect(session!.id).not.toBe("");
      expect(getActiveSessionId()).toBe(session!.id);
      expect(getActiveSessionId()).toBeTruthy();   // getter 也不返回空串
    });

    it("无 id 参数（undefined）应自动生成 ID", () => {
      const { result } = renderHook(() => useSerialSessions());

      act(() => {
        result.current.createSession("测试");
      });

      const session = result.current.activeSession;
      expect(session).not.toBeNull();
      expect(session!.id).toBeTruthy();
      expect(session!.id).toMatch(/^serial-monitor-\d+$/);
    });

    it("有效 id 应直接使用——不覆盖", () => {
      const { result } = renderHook(() => useSerialSessions());

      act(() => {
        result.current.createSession("测试", "custom-id-123");
      });

      expect(result.current.activeSession!.id).toBe("custom-id-123");
      expect(getActiveSessionId()).toBe("custom-id-123");
    });

    it("新会话自动设为活跃", () => {
      const { result } = renderHook(() => useSerialSessions());

      act(() => {
        result.current.createSession("A", "id-A");
      });

      expect(result.current.activeSessionId).toBe("id-A");
      expect(result.current.activeSession!.name).toBe("A");
    });
  });

  describe("removeSession", () => {
    it("删除活跃会话 → 自动切换到剩余第一个", () => {
      const { result } = renderHook(() => useSerialSessions());

      act(() => { result.current.createSession("A", "a"); });
      act(() => { result.current.createSession("B", "b"); });

      expect(result.current.sessions).toHaveLength(2);
      expect(result.current.activeSessionId).toBe("b");

      act(() => { result.current.removeSession("b"); });

      expect(result.current.sessions).toHaveLength(1);
      expect(result.current.activeSessionId).toBe("a");
    });

    it("删除最后一个会话 → activeSessionId 为 null", () => {
      const { result } = renderHook(() => useSerialSessions());

      act(() => { result.current.createSession("A", "a"); });
      act(() => { result.current.removeSession("a"); });

      expect(result.current.sessions).toHaveLength(0);
      expect(result.current.activeSessionId).toBeNull();
      expect(result.current.activeSession).toBeNull();
    });
  });

  describe("updateSession", () => {
    it("部分更新会话字段", () => {
      const { result } = renderHook(() => useSerialSessions());

      act(() => { result.current.createSession("A", "a"); });
      act(() => { result.current.updateSession("a", { name: "改名", baudRate: "9600" }); });

      expect(result.current.activeSession!.name).toBe("改名");
      expect(result.current.activeSession!.baudRate).toBe("9600");
      // 未修改的字段保持默认
      expect(result.current.activeSession!.showEcho).toBe(true);
    });
  });

  describe("resetAll", () => {
    it("清空所有会话和活跃状态", () => {
      const { result } = renderHook(() => useSerialSessions());

      act(() => { result.current.createSession("A", "a"); });
      act(() => { result.current.createSession("B", "b"); });
      act(() => { result.current.resetAll(); });

      expect(result.current.sessions).toHaveLength(0);
      expect(result.current.activeSessionId).toBeNull();
      expect(result.current.activeSession).toBeNull();
      expect(getActiveSessionId()).toBeNull();
    });
  });

  describe("getActiveSessionId / getSessionById（模块级 getter）", () => {
    it("getActiveSessionId 始终返回最新活跃 ID", () => {
      const { result } = renderHook(() => useSerialSessions());

      act(() => { result.current.createSession("A", "a"); });
      expect(getActiveSessionId()).toBe("a");

      act(() => { result.current.setActiveSession(null); });
      expect(getActiveSessionId()).toBeNull();
    });

    it("getSessionById 按 ID 查找会话", () => {
      const { result } = renderHook(() => useSerialSessions());

      act(() => { result.current.createSession("A", "a"); });

      const found = getSessionById("a");
      expect(found).toBeDefined();
      expect(found!.name).toBe("A");
      expect(getSessionById("nonexistent")).toBeUndefined();
    });
  });
});
