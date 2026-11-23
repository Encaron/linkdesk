/**
 * `aiPolicy` 命名空间——AI 权限档位的**插件可见读面**（2026-11-24 · AI 安全 · 权限档位与提权）。
 *
 * 规格：`05-接口预留-万物皆可插件.md` §二（渲染契约：替换体只准看见这些）
 *
 * 🔴 只读面：`getState`（档位 / 矩阵 / 风险表 / 受保护命令）＋ `onChange`（档位变更后重读并回调）。
 *   ⛔ 写档位**不在契约里**：写点只有壳命令 `aiPolicy.setMode`（`userOnly`，AI 够不着）。
 * 🔴 判定与档位值只在主进程（`policy/decide.ts`）；渲染体只格式化，⛔ 不自己判风险、不读 settings.json。
 */

import type { AiPolicyStateDto } from "../../types/ipc/aiPolicy";

export interface AiPolicyAPI {
  /** AI 权限档位读面——只读：getState（快照）＋ onChange（变更后重读并回调）。写档位不在此面 */
  aiPolicy: {
    /** 当前策略快照（档位 / 四档矩阵 / 风险表 / 受保护命令） */
    getState(): Promise<AiPolicyStateDto>;
    /** 档位变更订阅——回调参数是**重新读过**的快照（不是配置值）；返回退订函数 */
    onChange(cb: (state: AiPolicyStateDto) => void): () => void;
  };
}
