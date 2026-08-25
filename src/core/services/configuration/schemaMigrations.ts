/**
 * 配置 schema 版本迁移——对标 VS Code 配置迁移机制（configurationRegistry 版本化）。
 * E5.8#85 补课（用户 2026-08-25：「归一化没做好」）：#85 圆角绝对化建好了新参考系（发射/播种/clamp），
 * 但存量 settings.json 的旧值（倍数 1.15/1.36）没迁——升级即被新参考系读成 ~1px。
 *
 * 为什么需要版本号而非值检测：旧语义值域（圆角倍数 [0,2]）与新语义值域（绝对 px [0,32]）重叠，
 * `1.15` 本身无法自判新旧——必须靠一次性版本标志（app.schemaVersion）区分「已迁」与「未迁」。
 * 标志为未注册内部键：不进 getMergedSchema → 设置 UI 不可见；setConfigurationValue 对未注册键零门槛。
 *
 * 形态（AI 友好第 3 层——AI 加迁移不需要追踪）：
 *   未来任何语义切换（#86 glass 绝对化 / #87 清除语义 / #91 fontTone）只需在数据所在层调用
 *   registerConfigMigration({ version, name, migrate }) 登记一步；编排/版本过滤/落盘全部本模块处理，
 *   禁止再手写 startup.ts 一次性迁移块（#82 themeColorMode 是迁移机制落位前的历史一次性先例）。
 *
 * 幂等约定：迁移函数对「已迁值」重跑必须零变化（本模块不强制，迁移作者负责——#85 圆角迁移采用
 *   「读迁移时刻有效 token 冻结为绝对 px」公式，天然幂等：新语义下重跑覆写同值）。
 * 失败语义（原子）：任一待执行迁移抛错 → 本次不落盘不提升（下次启动全量重试）——防部分迁移后
 *   版本越过未成功迁移（其旧键永久停留旧格式）。迁移作者修正后自动恢复。
 * 成功语义：全部迁移通过即写版本标志（含零产出——presence 全 skip 的全新安装也标记已迁，
 *   避免每次启动重复跑；settings.json 增一行未注册内部键，设置 UI 不可见）。
 */
import { inspectConfiguration, setConfigurationValueBatch } from "./ConfigurationService";

/** schema 版本标志键——settings.json 顶层内部键，未注册（设置 UI 不可见，见模块头注释） */
export const SCHEMA_VERSION_KEY = "app.schemaVersion";
/** 初始版本——无标志的 settings.json 视为 1（首个迁移从 2 起） */
const SCHEMA_VERSION_INITIAL = 1;

/** 迁移上下文——迁移作者从 migrate(ctx) 解构 setMany 使用，无需命名类型（结构性匹配）。 */
interface ConfigMigrationContext {
  /** 入队一批配置变更（Record<key, value>）——编排后统一 setConfigurationValueBatch（单次持久化 + 单次 applier，#59 先例）。 */
  setMany: (values: Record<string, unknown>) => void;
}

export interface ConfigMigration {
  /** 目标 schema 版本——settings.json 当前版本 < 此值时才执行（升序） */
  version: number;
  /** 可读名——档案/调试/失败日志 */
  name: string;
  /** 迁移函数——只向 ctx.setMany 推变更不落盘（编排统一落盘）；presence 自查：旧值不存在则不加（零变更零写）。 */
  migrate: (ctx: ConfigMigrationContext) => Promise<void>;
}

const _migrations = new Map<number, ConfigMigration>();

/** 登记一个 schema 迁移——未来语义切换的唯一入口（见模块头注释） */
export function registerConfigMigration(migration: ConfigMigration): void {
  _migrations.set(migration.version, migration);
}

/** 测试/重登记用——清空全部迁移登记 */
export function clearConfigMigrations(): void {
  _migrations.clear();
}

/** 读取当前 schema 版本——无标志/非法 → SCHEMA_VERSION_INITIAL */
export function getConfigSchemaVersion(): number {
  const v = inspectConfiguration<number>(SCHEMA_VERSION_KEY).userValue;
  return typeof v === "number" && Number.isFinite(v) ? v : SCHEMA_VERSION_INITIAL;
}

/**
 * 运行所有待执行迁移——version > 当前，升序执行；产出并入统一 batch。
 * 全部通过 → 单次持久化（含变更值 + 版本标志提升到最高目标版本）；任一抛错 → 原子中止（零写零提升）。
 * 返回：true = 本次有待执行迁移且全部通过；false = 无待执行迁移 或 有迁移失败（下次启动重试）。
 */
export async function runPendingConfigMigrations(): Promise<boolean> {
  const current = getConfigSchemaVersion();
  const pending = [..._migrations.values()]
    .filter((m) => m.version > current)
    .sort((a, b) => a.version - b.version);
  if (pending.length === 0) return false;

  const batch: Array<{ key: string; value: unknown }> = [];
  for (const migration of pending) {
    try {
      await migration.migrate({
        setMany: (values) => {
          for (const [key, value] of Object.entries(values)) batch.push({ key, value });
        },
      });
    } catch (e) {
      // 原子失败——本次不落盘不提升，下次启动全量重试（防版本越过未成功迁移）
      console.error(`[ConfigMigration] "${migration.name}"（v${migration.version}）失败，本次中止（下次启动重试）：`, e);
      return false;
    }
  }
  // 全部通过 → 统一写版本标志（含零产出——全新安装也标记已迁，见模块头注释）
  batch.push({ key: SCHEMA_VERSION_KEY, value: pending[pending.length - 1].version });
  await setConfigurationValueBatch(batch);
  return true;
}
