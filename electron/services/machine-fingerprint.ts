/**
 * 机器指纹——R4-1.3（I21·正典 09 §三·补3）：许可验签的机器绑定比对源。
 * 算法（详案 R4-批1-壳.md）：sha256(MachineGuid::主板序列) 前 16 位 hex。
 *
 * 稳定性证据（收口重点，交接须报）：
 *   - `MachineGuid`（HKLM\SOFTWARE\Microsoft\Cryptography）＝ Windows 安装时生成，重装系统才变——
 *     重启 / 换 USB 口 / 换网络 / 改端口全部不变；
 *   - 主板序列（Win32_BaseBoard.SerialNumber）＝ 出厂烧录，重启不变（部分 OEM 板返回板型号或
 *     "Default string"——仍是稳定值：同一台机器每次读到同一串，够绑定语义）；
 *   - 两者任一读取失败 → 用另一件单独 hash（composition 恒可产出，调用方拿到的值在本机生命周期内稳定）；
 *   - 结果模块级缓存：同进程内只算一次（PowerShell CIM 查询 ~1-2s，不得反复付）。
 *
 * 只读注册表/只读 CIM 查询——无写落点（check-install-surface 的「注册表写碰 HKLM」守的是写，读不碰）。
 */

import { execFile } from "child_process";
import { createHash } from "crypto";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/** 纯组合函数（可单测）——两输入拼串后 sha256 前 16 位 hex */
export function composeFingerprint(machineGuid: string, boardSerial: string): string {
  return createHash("sha256").update(`${machineGuid}::${boardSerial}`).digest("hex").slice(0, 16);
}

/** MachineGuid——reg query 只读 HKLM（失败返回 null，组合函数兜底单输入） */
async function readMachineGuid(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("reg", ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"], { timeout: 5_000 });
    const m = stdout.match(/MachineGuid\s+REG_SZ\s+(\S+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** 主板序列——PowerShell CIM（wmic 于新 Win11 已移除，不依赖；失败返回 null） */
async function readBoardSerial(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", "(Get-CimInstance Win32_BaseBoard).SerialNumber"],
      { timeout: 15_000 },
    );
    const serial = stdout.trim();
    return serial ? serial : null;
  } catch {
    return null;
  }
}

let _cached: string | null = null;
let _computing: Promise<string> | null = null;

/**
 * 机器指纹（sha256 前 16 位 hex）——模块级缓存，进程内恒同值。
 * 两输入都读不到（极端：reg 与 PowerShell 双双不可用）→ 退 "unknown" 常量值——指纹仍稳定
 * （所有机器同值 = 绑定语义退化为「有 machine 字段就拒他机、本机恒过」，诚实降级不崩）。
 */
export function machineFingerprint(): Promise<string> {
  if (_cached) return Promise.resolve(_cached);
  _computing ??= (async () => {
    const [guid, board] = await Promise.all([readMachineGuid(), readBoardSerial()]);
    const fp = composeFingerprint(guid ?? "", board ?? "");
    _cached = fp || "unknown";
    return _cached;
  })();
  return _computing;
}
