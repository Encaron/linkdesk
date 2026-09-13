/**
 * 启动参数解析——E6#46a intake 三源归一的解析半。
 *
 * 三条 intake 源（启动 argv / second-instance argv / macOS open-file）最终都汇到
 * `parseLaunchPaths` 的分类结果：{ files, folders }。路由（文件夹→#47 开新窗、
 * 文件→焦点窗交 #46b 壳侧消费）在 main.ts 的 routeLaunchItems，本模块只做纯解析。
 *
 * 过滤规则（宁丢勿猜）：
 *   ① `-` 开头 = Electron 自身开关（--remote-debugging-port / --user-data-dir …），丢弃；
 *   ② 非绝对路径丢弃并静默——dev 模式 argv 里混着 `.`（工程根）等噪声，用户入口
 *      （文件关联 / 右键菜单 / 命令行）传的都是绝对路径，相对路径按 cwd 猜是错向归因；
 *   ③ statSync 失败（不存在/无权限）丢弃但 console.warn——启动路径失败不该打扰用户弹窗；
 *   ④ 同一路径出现多次只收一次（VS Code 同款去重）。
 */

import fs from 'node:fs';
import path from 'node:path';

export interface LaunchPaths {
  files: string[];
  folders: string[];
}

export function parseLaunchPaths(argv: string[]): LaunchPaths {
  const files: string[] = [];
  const folders: string[] = [];
  for (const raw of argv) {
    if (raw.startsWith('-')) continue;
    if (!path.isAbsolute(raw)) continue;

    let stat: fs.Stats;
    try {
      stat = fs.statSync(raw);
    } catch {
      console.warn(`[launch-args] 路径不存在，已丢弃: ${raw}`);
      continue;
    }

    const resolved = path.resolve(raw);
    if (stat.isDirectory()) {
      if (!folders.includes(resolved)) folders.push(resolved);
    } else {
      if (!files.includes(resolved)) files.push(resolved);
    }
  }
  return { files, folders };
}
