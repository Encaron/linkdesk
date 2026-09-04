/**
 * 机械检查：plugin.schema.json 三份跟踪拷贝**全文件**同步（E6#5/#6——SDK 以包内 schema 为唯一真源）。
 *
 * 背景：live schema = public/schemas/plugin.schema.json（发布态校验源）外，另有两份**整文件**拷贝：
 *   - docs/03-插件制造/plugin.schema.json（作者文档区）
 *   - packages/plugin-sdk/schemas/plugin.schema.json（SDK 包内，ajv-2020 编译消费）
 * SDK validate 消费**整个** schema（非仅 contributes 键）——check-contributes ② 只比 contributes 字段，
 * 管不住 readme/entry-required/allOf if 等非 contributes 段的漂移 → 本脚本整文件字节级守卫（单一权威，
 * 拷贝须与 live 字节相同）。SDK 跑在发布前的 plugin.json 上，schema 漂移 = 作者拿到旧版校验 = 红灯。
 *
 * 用法：node scripts/check-plugin-schema-sync.mjs（已挂 npm run check，check-contributes 后）
 * 退出码 0 = 三份全同，退出码 1 = 有漂移（打印到 stderr）。
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// live = 权威；其余为必须字节相同的跟踪拷贝
const COPIES = [
  { name: "public/schemas/plugin.schema.json", role: "live（权威）" },
  { name: "docs/03-插件制造/plugin.schema.json", role: "作者文档区拷贝" },
  { name: "packages/plugin-sdk/schemas/plugin.schema.json", role: "SDK 包内拷贝（ajv 编译消费）" },
];

function main() {
  const live = COPIES[0];
  const bytes = new Map(
    COPIES.map((c) => [c.name, readFileSync(resolve(ROOT, c.name))]),
  );
  const liveBytes = bytes.get(live.name);

  const drifted = COPIES.slice(1).filter((c) => !bytes.get(c.name).equals(liveBytes));
  if (drifted.length > 0) {
    for (const c of drifted) {
      console.error(`❌ ${c.name}（${c.role}）与 ${live.name}（${live.role}）字节不一致——单一权威，拷贝须与 live 同步`);
    }
    console.error(`\n同步命令：cp public/schemas/plugin.schema.json docs/03-插件制造/plugin.schema.json && cp public/schemas/plugin.schema.json packages/plugin-sdk/schemas/plugin.schema.json`);
    process.exit(1);
  }

  console.log(`✅ plugin.schema.json 三份拷贝全文件同步——${COPIES.length} 份字节一致（live 权威）。`);
}

main();
