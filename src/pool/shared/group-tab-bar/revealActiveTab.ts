/**
 * 活动标签「滚入视野」的纯增量计算——04 池「标签栏内容自适应与横向滚动」配套之一。
 *
 * 标签变宽后，切标签 / 新开标签（落最右）/ 关标签 / 键盘切标签时，目标标签可能不在可视区
 * ——本函数算出把目标完整带进视野所需的最小水平滚动增量（已在视野内 ⇒ 0，纹丝不动）。
 *
 * 🔴 为什么用 getBoundingClientRect 差值而不用 offsetLeft：标签 item 外包着一层
 * `display: contents` 的指示器占位 wrapper（GroupTabBar 渲染结构，E5.6#16.7），标签的
 * offsetParent 不保证是滚动容器（更上层的定位祖先会截胡），offsetLeft 会指错基准；
 * rect 差值 + 回补 scrollLeft 与容器是谁无关，永远算得对。
 *
 * 调用方（GroupTabBar）拿增量后自行决定 smooth/auto 与触发时机——本模块零 DOM 零 React，
 * 增量语义可单测（revealActiveTab.test.ts）。
 */

/**
 * @param scrollLeft    滚动容器当前 scrollLeft
 * @param clientWidth   滚动容器可视宽
 * @param contentLeft   目标标签左缘在**滚动内容坐标系**里的位置
 *                      （= elRect.left − listRect.left + scrollLeft）
 * @param contentWidth  目标标签宽
 * @returns 建议增量（负 = 往左滚）；0 = 已完整可见
 */
export function revealDelta(
  scrollLeft: number,
  clientWidth: number,
  contentLeft: number,
  contentWidth: number,
): number {
  // 目标比可视区还宽——对齐**左缘**（标题开头优先；对齐右缘只会露出标题尾巴），右端交给用户继续滚
  if (contentWidth >= clientWidth) return contentLeft - scrollLeft;
  if (contentLeft < scrollLeft) return contentLeft - scrollLeft;
  const overRight = contentLeft + contentWidth - (scrollLeft + clientWidth);
  if (overRight > 0) return overRight;
  return 0;
}
