/**
 * BackgroundLayer——E5.8#50.8。全窗背景图片层（FloatingLayerHost 的底镜像）。
 *
 * FloatingLayerHost = 顶镜像（z-index toast 浮层宿主）；BackgroundLayer = 底镜像
 * （z-index 0，zone 层之下、`.pool-root` 透明底座之上）。
 * 消费 #50.6 ThemeEngine 写 :root 的 --bg-image / --bg-opacity / --bg-mask——
 * 默认 none/1/0 = 不可见零成本；主题带 background 时全窗铺图（图从表面留缝透出，#50.7 悬浮）。
 *
 * 纯装饰层：无 props/无状态/无交互（pointer-events: none + aria-hidden），哑渲染零 import 核心。
 * 样式见 BackgroundLayer.css（自包含，pool-css 检查器约束）。
 */
import "./BackgroundLayer.css";

function BackgroundLayer() {
  return <div className="ldk-background-layer" aria-hidden="true" />;
}

export default BackgroundLayer;
