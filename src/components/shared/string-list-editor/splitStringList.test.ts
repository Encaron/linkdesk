/**
 * splitStringList 单测（「设置控件-词表正典与共享化」阶段 3.3 · E6#30c 身份规则）。
 *
 * 钉三条（平移自设置仓，语义一字未改）：
 *   ① `default` 数组 = locked，精确形态恒锁；
 *   ② 官方源的「其他形态」（仓库主页 / HEAD 直链）按 urlSourceKey 身份一并滤除——凭任何入口都进不了作者行；
 *   ③ 非 github 串回精确比较（urlSourceKey 返 null 不误伤），且非字符串项一律丢弃。
 * fixture 全虚构（硬约束 21）——owner/repo 都是编的。
 */
import { describe, it, expect } from "vitest";
import { splitStringList } from "./splitStringList";

const OFFICIAL = "https://github.com/acme-official/registry";
const AUTHOR = "https://github.com/acme-user/my-sources";

describe("splitStringList", () => {
  it("default ⇒ locked；值里同身份的其他形态不进可编辑行", () => {
    const { locked, editable } = splitStringList(
      { default: [OFFICIAL] },
      [AUTHOR, OFFICIAL, "https://github.com/acme-official/registry/tree/main"],
    );
    expect(locked).toEqual([OFFICIAL]);
    expect(editable).toEqual([AUTHOR]);
  });

  it("无 default ⇒ locked 空，可编辑行＝全部字符串项（非字符串丢弃）", () => {
    const { locked, editable } = splitStringList({}, [AUTHOR, 42, null, "https://example.invalid/list"]);
    expect(locked).toEqual([]);
    expect(editable).toEqual([AUTHOR, "https://example.invalid/list"]);
  });

  it("值缺省（undefined / 非数组）⇒ 回落到 default 当基数，仍滤掉锁定项", () => {
    expect(splitStringList({ default: [OFFICIAL] }, undefined)).toEqual({ locked: [OFFICIAL], editable: [] });
    expect(splitStringList({ default: [OFFICIAL] }, "not-an-array")).toEqual({ locked: [OFFICIAL], editable: [] });
  });

  it("非 github 串不受身份折叠影响——精确比较", () => {
    const { editable } = splitStringList({ default: ["file://a"] }, ["file://a", "file://a/", "file://b"]);
    expect(editable).toEqual(["file://a/", "file://b"]);
  });

  it("default 名下非字符串项不入 locked", () => {
    expect(splitStringList({ default: [OFFICIAL, 7] }, []).locked).toEqual([OFFICIAL]);
  });
});
