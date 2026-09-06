/**
 * 机械检查：author 面 JSON Schema **整文件**同步守卫（E6#5/#6 立 plugin.schema；E6#60 扩 theme/icon）。
 *
 * 背景：live schema = public/schemas/*.schema.json（发布态校验源 + repo 内 $schema 编辑器引用），
 * 另有**整文件**字节拷贝供各消费面：
 *   - plugin.schema.json：live + docs/03-插件制造/（作者文档区）+ packages/plugin-sdk/schemas/（SDK 包内，ajv 编译消费）
 *   - theme.schema.json / icon-theme.schema.json：live + packages/plugin-sdk/schemas/（E6#60 收编——npm 作者
 *     拿数据文件 schema，IntelliSense + SDK validate；收编前仅仓库一份，第三方作者无 npm 通道）
 * SDK validate 消费**整个** schema（非仅 contributes 键）——check-contributes ② 只比 contributes 字段，
 * 管不住 readme/entry-required/allOf if 等非 contributes 段的漂移 → 本脚本整文件字节级守卫（单一权威 live，
 * 拷贝须与 live 字节相同）。SDK 跑在发布前的数据上，schema 漂移 = 作者拿到旧版校验 = 红灯。
 *
 * 用法：node scripts/check-plugin-schema-sync.mjs（已挂 npm run check）
 * 退出码 0 = 全部文件组内同步，退出码 1 = 有漂移（打印到 stderr）。
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// 每文件组：copies[0] = live（权威）；其余为必须字节相同的跟踪拷贝
const FILES = [
  {
    schema: "public/schemas/plugin.schema.json",
    copies: [
      { name: "public/schemas/plugin.schema.json", role: "live（权威）" },
      { name: "docs/03-插件制造/plugin.schema.json", role: "作者文档区拷贝" },
      { name: "packages/plugin-sdk/schemas/plugin.schema.json", role: "SDK 包内拷贝（ajv 编译消费）" },
    ],
  },
  {
    schema: "public/schemas/theme.schema.json",
    copies: [
      { name: "public/schemas/theme.schema.json", role: "live（权威，E5.8#129）" },
      { name: "packages/plugin-sdk/schemas/theme.schema.json", role: "SDK 包内拷贝（E6#60 收编）" },
    ],
  },
  {
    schema: "public/schemas/icon-theme.schema.json",
    copies: [
      { name: "public/schemas/icon-theme.schema.json", role: "live（权威，E6#60 重写对齐引擎）" },
      { name: "packages/plugin-sdk/schemas/icon-theme.schema.json", role: "SDK 包内拷贝（E6#60 收编）" },
    ],
  },
];

function main() {
  let anyDrifted = false;
  for (const group of FILES) {
    const live = group.copies[0];
    const liveBytes = readFileSync(resolve(ROOT, live.name));
    const drifted = group.copies
      .slice(1)
      .filter((c) => !readFileSync(resolve(ROOT, c.name)).equals(liveBytes));
    if (drifted.length > 0) {
      anyDrifted = true;
      for (const c of drifted) {
        console.error(`❌ ${c.name}（${c.role}）与 ${live.name}（${live.role}）字节不一致——单一权威，拷贝须与 live 同步`);
        console.error(`   同步：cp ${live.name} ${c.name}`);
      }
    }
  }
  if (anyDrifted) {
    process.exit(1);
  }

  const total = FILES.reduce((n, g) => n + g.copies.length, 0);
  console.log(`✅ author 面 schema ${FILES.map((g) => `${g.schema.replace("public/schemas/", "")}×${g.copies.length}`).join("、")} 全部字节同步——共 ${total} 份（live 权威）。`);
}

main();
