/**
 * 壳布局引擎——区域 dock 与 float。
 * E5#9：壳内四个区域通过 LayoutEngine 获取 bounds，不再依赖硬编码 CSS flex。
 *
 * 换布局（侧栏换右边）= 改一行配置。四个组件代码一行不改。
 *
 * E5 只实现 mode === "docked"。v1.4 实现 floating——数据结构已留口子。
 *
 * 对标 Visual Studio 工具窗口系统（IVsWindowFrame / dock target / floating）。
 *
 * 设计依据：docs/02-Electron架构/E5_核心归一化与壳重构_待执行/01-壳通信骨架/壳布局引擎.md
 */

import { Emitter, type Event } from "../CoreEvents";

/* ── 类型定义 ── */

/**
 * 壳区域配置。
 * E5 只实现 mode === "docked"。
 * v1.4 实现 mode === "floating"——不改这个接口。
 */
export interface ZoneConfig {
  /** 区域唯一标识 */
  zone: string;

  /** 当前模式——E5 总是 "docked"，v1.4 加 "floating" */
  mode: "docked" | "floating";

  // ── Docked 属性（mode === "docked" 时生效，E5 实现）──

  dock?: {
    /** 贴哪条边 */
    edge: "left" | "right" | "center" | "bottom";
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
  };

  // ── Floating 属性（mode === "floating" 时生效，v1.4 实现）──

  float?: {
    x: number;
    y: number;
    width: number;
    height: number;
    /** z-index——floating zone 之间可层叠 */
    zIndex?: number;
    /** 最小尺寸——float 时重置尺寸的底线 */
    minWidth?: number;
    minHeight?: number;
  };

  // ── 控制（E5 声明，v1.4 消费）──

  /** 是否可以拖出 dock——侧栏=true，图标栏=false，主区=false */
  undockable?: boolean;
  /** 显示/隐藏 */
  visible?: boolean;
}

/** 区域边界——布局引擎输出给组件。docked 和 floating 都用同一个。 */
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
    // E5 默认布局——4 个 docked zone，和 E5 执行前视觉完全一致
    this._zones = [
      {
        zone: "iconbar",
        mode: "docked",
        dock: { edge: "left", width: 42, minWidth: 42, maxWidth: 42 },
        undockable: false,
      },
      {
        zone: "sidebar",
        mode: "docked",
        dock: { edge: "left", width: 280, minWidth: 170, maxWidth: 600, resizable: true, collapsedWidth: 4 },
        undockable: true,
      },
      {
        zone: "main",
        mode: "docked",
        dock: { edge: "center", flex: 1 },
        undockable: false,
      },
      {
        zone: "statusbar",
        mode: "docked",
        dock: { edge: "bottom", height: 24, minHeight: 24, maxHeight: 24 },
        undockable: false,
      },
    ];
  }

  /** 设置容器尺寸（窗口 resize 时调用） */
  setContainerSize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this._containerWidth = width;
    this._containerHeight = height;
    this._recalculate();
  }

  /** 设置布局——替换全部 zone 配置 */
  setLayout(zones: ZoneConfig[]): void {
    this._zones = [...zones];
    this._recalculate();
  }

  /** 添加一个 zone（v1.4 浮窗 dock 回来时用） */
  addZone(zone: ZoneConfig): void {
    this._zones.push(zone);
    this._recalculate();
  }

  /** 移除一个 zone（v1.4 undock 时用） */
  removeZone(zoneId: string): void {
    this._zones = this._zones.filter((z) => z.zone !== zoneId);
    this._bounds.delete(zoneId);
    this._onDidChangeLayout.fire();
  }

  /** 移动 zone 的 dock 边（侧栏从左换到右） */
  dockTo(zoneId: string, edge: "left" | "right" | "center" | "bottom"): void {
    const z = this._zones.find((z) => z.zone === zoneId);
    if (!z || !z.dock) return;
    z.dock.edge = edge;
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

  /** 获取某个 zone 的当前 bounds——不管 docked 还是 floating */
  getBounds(zoneId: string): ZoneBounds | undefined {
    // 先查浮动坐标
    const zone = this._zones.find((z) => z.zone === zoneId);
    if (zone?.mode === "floating" && zone.float) {
      return { x: zone.float.x, y: zone.float.y, width: zone.float.width, height: zone.float.height };
    }
    // 查 dock 坐标
    return this._bounds.get(zoneId);
  }

  /** 获取全部 zone 配置（只读） */
  getAllZones(): readonly ZoneConfig[] {
    return this._zones;
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

    // E5 只处理 mode === "docked" 的 zone
    const docked = this._zones.filter((z) => z.mode === "docked" && z.dock);
    // floating zone 的坐标由 float 字段直接返回——不经过 _recalculate

    const bottomZones = docked
      .filter((z) => z.dock!.edge === "bottom")
      .sort((a, b) => (a.dock!.order ?? 0) - (b.dock!.order ?? 0));
    const leftZones = docked
      .filter((z) => z.dock!.edge === "left")
      .sort((a, b) => (a.dock!.order ?? 0) - (b.dock!.order ?? 0));
    const rightZones = docked
      .filter((z) => z.dock!.edge === "right")
      .sort((a, b) => (a.dock!.order ?? 0) - (b.dock!.order ?? 0));
    const centerZones = docked.filter((z) => z.dock!.edge === "center");

    const bottomHeight = bottomZones.reduce((sum, z) => sum + (z.dock!.height ?? 0), 0);
    const contentHeight = Math.round(H - bottomHeight);

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

    // Center zones——填满剩余空间
    for (const z of centerZones) {
      this._bounds.set(z.zone, {
        x: Math.round(leftWidth),
        y: 0,
        width: centerWidth,
        height: contentHeight,
      });
    }

    // Bottom zones——底部从左向右
    let bottomX = 0;
    for (const z of bottomZones) {
      const h = z.dock!.height!;
      this._bounds.set(z.zone, {
        x: Math.round(bottomX),
        y: contentHeight,
        width: W,
        height: h,
      });
      bottomX += z.dock!.width ?? W;
    }

    // E5#9d：总宽度验证
    const totalW = docked.reduce((s, z) => {
      if (z.dock!.edge === "center") return s + centerWidth;
      if (z.dock!.edge === "bottom") return s; // bottom zone 不计入宽度
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
