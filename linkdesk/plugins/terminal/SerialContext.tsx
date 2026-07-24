/**
 * 终端插件的 SerialContext——E2b #7 从 src/core/ 迁出。
 *
 * 薄封装层：终端插件内部仍可用 `useSerialContext` 这个名字，
 * 但底层走的是 `src/core/SourceStateContext`（通用数据源）。
 * 核心不知道"串口"——只知道"数据源"。
 */

export {
  useSourceState as useSerialContext,
  type PortInfo,
  type SourceState as SerialState,
  type SourceActions as SerialActions,
  type SourceStateContextValue as SerialContextValue,
} from "@src/core/SourceStateContext";

import SourceStateContext from "@src/core/SourceStateContext";
export default SourceStateContext;
