// ══════════════════════════════════════════════════════════════════════════
// 🔴 生成物 —— ⛔ 勿手改。生成器 scripts/gen-assoc-exts.mjs（门禁 gen:assoc-exts --check 逐字节比对）。
// 来源 = bundled-plugins.lock.json 里 seed:true 的随包件声明（45 条 / 6 只插件）。
// 用途 = syswrite.cpp 的 kExts[]：写/删 HKCU\Software\Classes\<ext>\OpenWithProgids 与
//        HKCU\Software\LinkDesk\Capabilities\FileAssociations —— 即**安装器静态半**。
// 与运行期半的关系：插件装卸产生的动态半住 electron/services/os-associations.ts，
//        且**只碰不在本清单里的扩展名**（静态半由安装器管，软件内不重复写）。
// 改声明请改插件仓的 contributes.fileAssociations，然后 npm run gen:assoc-exts。
// ══════════════════════════════════════════════════════════════════════════
#pragma once

/** 按扩展名字典序（生成器排序 ⇒ 跨机逐字节一致） */
static const wchar_t* kExts[] = {
    L".bash", L".bat", L".c", L".cfg",
    L".cjs", L".cmd", L".cpp", L".css",
    L".dart", L".diff", L".go", L".h",
    L".hpp", L".htm", L".html", L".ini",
    L".java", L".js", L".json", L".jsonc",
    L".jsx", L".kt", L".less", L".log",
    L".lua", L".md", L".mdx", L".mjs",
    L".patch", L".php", L".py", L".rb",
    L".rs", L".scss", L".sh", L".sql",
    L".svg", L".swift", L".toml", L".ts",
    L".tsx", L".txt", L".xml", L".yaml",
    L".yml",
};
