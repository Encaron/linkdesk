/**
 * 壳布局引擎——E5#9 区域 dock 坐标权威（E5.7 极简Pool 时代 = 侧栏宽度权威）。
 * E5#9：壳内四个区域通过 LayoutEngine 获取 bounds，不再依赖硬编码 CSS flex。
 *
 * E5.7#12.5 起 bounds 推流删除——池内 zone 布局由 flex 接管，LayoutEngine 剩余职责：
 *   1. 侧栏折叠真相源——App.tsx getBounds ≤48 判折叠（:531）
 *   2. 拖拽钳制——usePoolSync resizeZone clamp（:562，#13 拖拽 commit 的钳制点）
 *   3. 钳制界推送——usePoolSync getZone dock.minWidth/maxWidth（:729-730）
 *   4. 面板高度真相源——E5.7#63.7：panel zone（底部 dock）+ resizeZoneHeight clamp（:130），
 *      App.tsx panel:resize 事件桥钳制后经 layoutVersion 重推回池
 *
 * E5.7#31.5 死肉整删（2026-08-15）：setLayout / addZone / removeZone / dockTo / getAllZones +
 * floating 模式分支 + ZoneConfig 的 float / undockable / visible 字段——E5.6 多池时代残肢，
 * 全仓库零调用方（v1.4 浮窗实现载体 = 主进程 WindowManager 新 BrowserWindow，不走壳渲染
 * 进程几何；恢复成本 = git history）。
 *
 * 对标 Visual Studio 工具窗口系统（IVsWindowFrame / dock target / floating）。
 * 设计依据：docs/02-Electron架构/E5_核心归一化与壳重构_待执行/01-壳通信骨架/壳布局引擎.md
 */

import { Emitter, type Event } from "../../react/events/CoreEvents";

/* ── 类型定义 ── */

/** 壳区域配置——纯 docked（E5 只实现 docked；floating 分支已随 E5.7#31.5 整删） */
export interface ZoneConfig {
  /** 区域唯一标识 */
  zone: string;

  dock?: {
    /** 贴哪条边 */
    edge: "left" | "right" | "center" | "bottom" | "top";
    /** 固定宽度（left/right zone） */
    width?: number;
    /** 固定高度（bottom zone） */
    height?: number;
    /** 弹性比例（center zone，默认 1） */
    flex?: number;
    /** 最小/最大尺寸 */
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
    /** 是否可拖拽 resize */
    resizable?: boolean;
    /** 同 edge 多个 zone 时的排列顺序——越小越靠近窗口边缘 */
    order?: number;
    /** 🆕 E5#49a：折叠时的最小宽度（侧栏折叠后留 4px 竖条手柄） */
    collapsedWidth?: number;
    /** 🆕 E5.8#36.7：面板横向对齐（顶/底面板消费——center=主栏宽 / left=延伸到左侧栏 / right=延伸到右侧栏 / justify=全宽）。
     *  几何由池 grid 推导（DTO 尺寸 + 自身 CSS 常量），引擎只存配置 + 触发重推。默认 center。 */
    align?: "left" | "center" | "right" | "justify";
  };
}

/** 区域边界——布局引擎输出给组件。 */
export interface ZoneBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/* ── LayoutEngine ── */

export class LayoutEngine {
  private _zones: ZoneConfig[] = [];
  private _bounds = new Map<string, ZoneBounds>();
  private _containerWidth = 0;
  private _containerHeight = 0;
  private _onDidChangeLayout = new Emitter<void>();

  /** 布局变更事件——组件订阅以响应 bounds 变化 */
  readonly onDidChangeLayout: Event<void> = this._onDidChangeLayout.event;

  constructor() {
    // E5 默认布局——5 个 docked zone（E5.7#63.7 加 panel：底部面板，默认高 220，
    // 钳制界 120-600；order 小的贴窗口底边——statusbar 0 最贴边，panel 1 在其上）
    this._zones = [
      {
        zone: "iconbar",
        dock: { edge: "left", width: 42, minWidth: 42, maxWidth: 42 },
      },
      {
        zone: "sidebar",
        dock: { edge: "left", width: 280, minWidth: 170, maxWidth: 600, resizable: true, collapsedWidth: 4 },
      },
      {
        zone: "main",
        dock: { edge: "center", flex: 1 },
      },
      {
        zone: "panel",
        dock: {
          edge: "bottom",
          height: 220,
          minHeight: 120,
          maxHeight: 600,
          resizable: true,
          order: 1,
          align: "center",
        },
      },
      {
        zone: "statusbar",
        dock: { edge: "bottom", height: 24, minHeight: 24, maxHeight: 24, order: 0 },
      },
    ];
  }

  /* ── E5.8#36.7 复活 5 方法（E5 原版 c010bf1e^ 取回，适配当前 ZoneConfig——无 mode/float 字段）── */

  /** 设置布局——替换全部 zone 配置 */
  setLayout(zones: ZoneConfig[]): void {
    this._zones = [...zones];
    this._recalculate();
  }

  /** 添加一个 zone（右侧栏 zone 消费方） */
  addZone(zone: ZoneConfig): void {
    this._zones.push(zone);
    this._recalculate();
  }

  /** 移除一个 zone */
  removeZone(zoneId: string): void {
    this._zones = this._zones.filter((z) => z.zone !== zoneId);
    this._bounds.delete(zoneId);
    this._onDidChangeLayout.fire();
  }

  /** 移动 zone 的 dock 边（面板位置 + 侧栏换边消费方）。
   *  E5 原版语义 + 双槽互换规则：sidebar ↔ rightSidebar 恒占对边（主侧栏换右 → agent 右侧栏自动跳左）。 */
  dockTo(zoneId: string, edge: "left" | "right" | "center" | "bottom" | "top"): void {
    const z = this._zones.find((z) => z.zone === zoneId);
    if (!z || !z.dock) return;
    z.dock.edge = edge;
    if (zoneId === "sidebar" && (edge === "left" || edge === "right")) {
      const rs = this._zones.find((z) => z.zone === "rightSidebar");
      if (rs?.dock) rs.dock.edge = edge === "right" ? "left" : "right";
    }
    this._recalculate();
  }

  /** 获取全部 zone 配置（只读） */
  getAllZones(): readonly ZoneConfig[] {
    return this._zones;
  }

  /** 设置面板横向对齐（E5 无此——本轮新消费方，dock 模型扩展）。几何由池 grid 推导，引擎只存配置 + 触发重推。 */
  setAlign(zoneId: string, align: "left" | "center" | "right" | "justify"): void {
    const z = this._zones.find((z) => z.zone === zoneId);
    if (!z || !z.dock) return;
    z.dock.align = align;
    this._recalculate();
  }

  /** 设置容器尺寸（窗口 resize 时调用） */
  setContainerSize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this._containerWidth = width;
    this._containerHeight = height;
    this._recalculate();
  }

  /** 调整 zone 尺寸——clamp 到 minWidth/maxWidth */
  resizeZone(zoneId: string, newWidth: number): void {
    const z = this._zones.find((z) => z.zone === zoneId);
    if (!z || !z.dock) return;
    z.dock.width = Math.max(
      z.dock.minWidth ?? 0,
      Math.min(z.dock.maxWidth ?? Infinity, Math.round(newWidth)),
    );
    this._recalculate();
  }

  /** 直接设 zone 宽度——不 clamp。专用于 collapse/expand 切换。 */
  setZoneWidth(zoneId: string, width: number): void {
    const z = this._zones.find((z) => z.zone === zoneId);
    if (!z || !z.dock) return;
    z.dock.width = Math.round(width);
    this._recalculate();
  }

  /** 调整 zone 高度——clamp 到 minHeight/maxHeight（E5.7#63.7：面板拖拽 + 启动恢复都走这里，
   *  恢复值越界也被钳回合法区间，无需无钳制直设的对应物） */
  resizeZoneHeight(zoneId: string, newHeight: number): void {
    const z = this._zones.find((z) => z.zone === zoneId);
    if (!z || !z.dock) return;
    z.dock.height = Math.max(
      z.dock.minHeight ?? 0,
      Math.min(z.dock.maxHeight ?? Infinity, Math.round(newHeight)),
    );
    this._recalculate();
  }

  /** 获取某个 zone 的当前 bounds */
  getBounds(zoneId: string): ZoneBounds | undefined {
    return this._bounds.get(zoneId);
  }

  /** 获取某个 zone 配置 */
  getZone(zoneId: string): ZoneConfig | undefined {
    return this._zones.find((z) => z.zone === zoneId);
  }

  /* ── E5#9b：核心坐标计算（docked 模式）── */

  private _recalculate(): void {
    // E5#9e：像素对齐——容器尺寸先取整，所有后续计算全整像素
    const W = Math.round(this._containerWidth);
    const H = Math.round(this._containerHeight);
    if (W === 0 || H === 0) return;

    const docked = this._zones.filter((z) => z.dock);

    const bottomZones = docked
      .filter((z) => z.dock!.edge === "bottom")
      .sort((a, b) => (a.dock!.order ?? 0) - (b.dock!.order ?? 0));
    const topZones = docked
      .filter((z) => z.dock!.edge === "top")
      .sort((a, b) => (a.dock!.order ?? 0) - (b.dock!.order ?? 0));
    const leftZones = docked
      .filter((z) => z.dock!.edge === "left")
      .sort((a, b) => (a.dock!.order ?? 0) - (b.dock!.order ?? 0));
    const rightZones = docked
      .filter((z) => z.dock!.edge === "right")
      .sort((a, b) => (a.dock!.order ?? 0) - (b.dock!.order ?? 0));
    const centerZones = docked.filter((z) => z.dock!.edge === "center");

    const bottomHeight = bottomZones.reduce((sum, z) => sum + (z.dock!.height ?? 0), 0);
    const topHeight = topZones.reduce((sum, z) => sum + (z.dock!.height ?? 0), 0);
    // E5.8#36.7：contentHeight 负值钳制——top+bottom 横带超高（resizeZoneHeight clamp 后仍可能）→ 钳到 0 + 出声
    const rawContentHeight = Math.round(H - topHeight - bottomHeight);
    const contentHeight = Math.max(0, rawContentHeight);
    if (contentHeight !== rawContentHeight) {
      console.warn(
        `[LayoutEngine] contentHeight 负值钳制: 计算 ${rawContentHeight}px → 0（top=${topHeight} bottom=${bottomHeight}）`,
      );
    }

    const leftWidth = leftZones.reduce((sum, z) => sum + (z.dock!.width ?? 0), 0);
    const rightWidth = rightZones.reduce((sum, z) => sum + (z.dock!.width ?? 0), 0);
    const centerWidth = Math.max(0, Math.round(W - leftWidth - rightWidth));

    // Left zones——从左向右堆叠，order 小的靠左
    let leftX = 0;
    for (const z of leftZones) {
      const w = z.dock!.width!;
      this._bounds.set(z.zone, {
        x: Math.round(leftX),
        y: 0,
        width: w,
        height: contentHeight,
      });
      leftX += w;
    }

    // Right zones——从右向左堆叠，order 小的靠右
    let rightX = W;
    for (const z of [...rightZones].reverse()) {
      const w = z.dock!.width!;
      rightX -= w;
      this._bounds.set(z.zone, {
        x: Math.round(rightX),
        y: 0,
        width: w,
        height: contentHeight,
      });
    }

    // Top zones——从顶向下堆叠，order 小的靠上（E5.8#36.7 新增）
    let topY = 0;
    for (const z of topZones) {
      const h = z.dock!.height!;
      this._bounds.set(z.zone, {
        x: 0,
        y: Math.round(topY),
        width: W,
        height: h,
      });
      topY += h;
    }

    // Center zones——填满剩余空间（顶横带存在时主区从 topHeight 起——池 grid 同为 row2）
    for (const z of centerZones) {
      this._bounds.set(z.zone, {
        x: Math.round(leftWidth),
        y: Math.round(topHeight),
        width: centerWidth,
        height: contentHeight,
      });
    }

    // Bottom zones——从窗口底边向上堆叠，order 小的贴底边（statusbar 0 最底，panel 1 其上）。
    // E5.7#63.7 前只有 statusbar 单 zone，堆叠循环恒等原逻辑（y = contentHeight）；panel 加入后
    // 多 bottom zone 必须逐层上移，否则重叠在同一 y。
    let bottomY = H;
    for (const z of bottomZones) {
      const h = z.dock!.height!;
      bottomY -= h;
      this._bounds.set(z.zone, {
        x: 0,
        y: Math.round(bottomY),
        width: W,
        height: h,
      });
    }

    // E5#9d：总宽度验证
    const totalW = docked.reduce((s, z) => {
      if (z.dock!.edge === "center") return s + centerWidth;
      if (z.dock!.edge === "bottom" || z.dock!.edge === "top") return s; // 横带不计入宽度
      return s + (z.dock!.width ?? 0);
    }, 0);
    if (Math.round(totalW) !== W) {
      console.warn(
        `[LayoutEngine] 宽度不匹配: 计算 ${Math.round(totalW)}px vs 容器 ${W}px。` +
        `left=${leftWidth} center=${centerWidth} right=${rightWidth}`,
      );
    }

    this._onDidChangeLayout.fire();
  }
}

/** 全局单例——壳内布局唯一权威（E5#9） */
export const layoutEngine = new LayoutEngine();
