/**
 * 🔴 生成物 —— ⛔ 勿手改。生成器 scripts/gen-assoc-exts.mjs（门禁 gen:assoc-exts --check 逐字节比对）。
 * 来源 = bundled-plugins.lock.json 里 seed:true 的随包件声明（45 条 / 6 只插件）。
 *
 * 两个消费者：
 *   ① registry-integration.ts 的 ASSOC_EXTENSIONS —— 安装器静态半的同源镜像（软件内开关
 *      「文件关联」时写/撤的就是这批类型；⛔ 再手抄一份清单必漂移）。
 *   ② os-associations.ts 的静态守卫 —— 运行期动态半**只碰不在本清单里的**扩展名。
 */
export const STATIC_ASSOC_EXTENSIONS = [
  '.bash',
  '.bat',
  '.c',
  '.cfg',
  '.cjs',
  '.cmd',
  '.cpp',
  '.css',
  '.dart',
  '.diff',
  '.go',
  '.h',
  '.hpp',
  '.htm',
  '.html',
  '.ini',
  '.java',
  '.js',
  '.json',
  '.jsonc',
  '.jsx',
  '.kt',
  '.less',
  '.log',
  '.lua',
  '.md',
  '.mdx',
  '.mjs',
  '.patch',
  '.php',
  '.py',
  '.rb',
  '.rs',
  '.scss',
  '.sh',
  '.sql',
  '.svg',
  '.swift',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
] as const;

/**
 * 可执行类扩展名（无点小写）——**两半共用的同一条禁列**（T6 判据 ③「exe 永不登记」）。
 *   静态收割侧：collectExtensions 见了就判红（随包件声明里出现即构建失败）。
 *   运行期侧：os-associations.ts 的 selectDynamicExtensions 直接跳过——插件声明了也不写候选。
 * ⚠️ 数据源 = 生成器里的 EXECUTABLE_DENY（本文件是它的产物），⛔ 别在别处再抄一份。
 * ⚠️ 只列**二进制容器 / 快捷方式**：`.bat`/`.cmd`/`.sh`/`.ps1` 是文本脚本，`editor` 正经声明了
 *   `.bat`/`.cmd`（当文本编辑）——它们**不在**禁列。
 */
export const DENIED_ASSOC_EXTENSIONS = [
  'com',
  'cpl',
  'dll',
  'drv',
  'exe',
  'lnk',
  'msi',
  'msp',
  'ocx',
  'pif',
  'scr',
  'sys',
] as const;
