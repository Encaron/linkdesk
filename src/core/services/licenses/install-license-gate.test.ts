/**
 * 壳安装门纯判定单测——R4-1.3（I21/#24 壳侧·正典 09 §三·补3）。
 * 判据（05 §三·4）：裁决在壳、免费零变更、过期＝无有效权益。
 */

import { describe, it, expect } from "vitest";
import { decideInstallLicenseGate } from "./install-license-gate";
import type { LicenseEntitlement } from "../../api/linkdesk-api/types";

const ENT: LicenseEntitlement = { pluginId: "paid-plugin", verifiedAt: "2026-11-20T00:00:00Z" };
/** exp = 2099-01-01（永远未临期的固定锚——测试不随时钟漂） */
const ENT_UNEXPIRED: LicenseEntitlement = { ...ENT, exp: 4070880000 };
/** exp = 2020-01-01（固定过期锚） */
const ENT_EXPIRED: LicenseEntitlement = { ...ENT, exp: 1577836800 };
const NOW = 1763606400000; // 2026-11-20 固定锚

describe("decideInstallLicenseGate", () => {
  it("pricing 未声明/缺 model ＝ 免费——现状行为零变更，权益表空也放行", () => {
    expect(decideInstallLicenseGate(undefined, "paid-plugin", [], NOW)).toBe("allow");
    expect(decideInstallLicenseGate({}, "paid-plugin", [], NOW)).toBe("allow");
    expect(decideInstallLicenseGate({ model: "" }, "paid-plugin", [], NOW)).toBe("allow");
  });

  it("声明了 pricing 但 pluginId 未随行 ＝ 无法归属——放行（v1 边界，09「边界与代价」）", () => {
    expect(decideInstallLicenseGate({ model: "paid" }, undefined, [], NOW)).toBe("allow");
  });

  it("声明了 pricing、无权益记录 ＝ 拦", () => {
    expect(decideInstallLicenseGate({ model: "paid" }, "paid-plugin", [], NOW)).toBe("block");
    expect(decideInstallLicenseGate({ model: "paid" }, "other-plugin", [ENT_UNEXPIRED], NOW)).toBe("block");
  });

  it("有效权益（无 exp = 永久）＝ 放行", () => {
    expect(decideInstallLicenseGate({ model: "paid" }, "paid-plugin", [ENT], NOW)).toBe("allow");
    expect(decideInstallLicenseGate({ model: "paid" }, "paid-plugin", [ENT_UNEXPIRED], NOW)).toBe("allow");
  });

  it("过期权益 ＝ 拦（过期＝无有效权益，重新验签才解锁）", () => {
    expect(decideInstallLicenseGate({ model: "paid" }, "paid-plugin", [ENT_EXPIRED], NOW)).toBe("block");
  });
});
