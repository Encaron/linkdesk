import { describe, expect, it } from "vitest";
import { pluginError } from "./plugin-error.js";

describe("pluginError", () => {
  it("构造出带 code / message / hint / details 的 Error", () => {
    const err = pluginError({
      code: "ENO_SESSION",
      message: "串口会话不存在",
      hint: "先 openPort 再调用",
      details: { sessionId: "s1" },
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("LinkDeskPluginError");
    expect(err.isPluginError).toBe(true);
    expect(err.code).toBe("ENO_SESSION");
    expect(err.message).toBe("串口会话不存在");
    expect(err.hint).toBe("先 openPort 再调用");
    expect(err.details).toEqual({ sessionId: "s1" });
  });

  it("可选字段缺省为 undefined", () => {
    const err = pluginError({ code: "EFAILED", message: "失败" });
    expect(err.hint).toBeUndefined();
    expect(err.details).toBeUndefined();
  });

  it("可以 throw / catch 并保留字段", () => {
    try {
      throw pluginError({ code: "EBAD_STATE", message: "状态不对" });
    } catch (e) {
      const err = e as ReturnType<typeof pluginError>;
      expect(err.isPluginError).toBe(true);
      expect(err.code).toBe("EBAD_STATE");
    }
  });

  it.each(["ENO_SESSION", "E_TIMEOUT_2", "badArg", "NoSession", "E-X"])(
    "非空业务码 %s 通过（E 开头只是建议）",
    (code) => {
      expect(pluginError({ code, message: "ok" }).code).toBe(code);
    },
  );

  it.each(["", "   "])("空码 %s 抛 TypeError", (code) => {
    expect(() => pluginError({ code, message: "ok" })).toThrow(TypeError);
  });

  it("空 message 抛 TypeError", () => {
    expect(() => pluginError({ code: "EFAILED", message: "" })).toThrow(TypeError);
  });

  it("非对象入参抛 TypeError（JS 调用面）", () => {
    expect(() => pluginError(undefined as never)).toThrow(TypeError);
  });
});
