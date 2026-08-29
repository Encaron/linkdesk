# create-linkdesk-plugin 脚手架

> 对应任务：E6#21-#23。对标 `yo code`（VS Code Extension Generator）。
> ⚠️ 2026-08-30 第 2.1 轮审视：§四 模板 plugin.json 原为 E5.6 schema，已按 E5.8 实测换代（见 §八）。
> 插件作者打一行命令 → 获得完整的插件项目骨架。

---

## 一、用户视角

```bash
npm create linkdesk-plugin my-cool-plugin

# 输出：
# ✔ Creating my-cool-plugin/
# ✔ Writing plugin.json
# ✔ Writing src/index.tsx
# ✔ Writing i18n/en.json
# ✔ Writing package.json
# ✔ Done!
#
#   cd my-cool-plugin
#   npm install
#   npm run dev      ← 浏览器打开，看到你的插件
#   npm run build    ← 产出 .linkdesk-plugin，可以发布了
```

---

## 二、包结构

```
packages/create-linkdesk-plugin/
  ├── package.json         # "bin": { "create-linkdesk-plugin": "./index.js" }
  ├── index.js             # CLI 入口（纯 Node.js，无依赖）
  └── template/            # 模板文件
      ├── plugin.json
      ├── package.json
      ├── tsconfig.json
      ├── src/
      │   └── index.tsx
      └── i18n/
          └── en.json
```

---

## 三、CLI 入口——index.js

```javascript
#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const pluginName = process.argv[2];

if (!pluginName) {
  // 交互式询问
  const readline = require("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question("Plugin name: ", (answer) => {
    rl.close();
    if (answer) createPlugin(answer);
  });
} else {
  createPlugin(pluginName);
}

function createPlugin(name) {
  const targetDir = path.join(process.cwd(), name);
  const templateDir = path.join(__dirname, "template");

  // 1. 创建目录
  fs.mkdirSync(targetDir, { recursive: true });
  copyDir(templateDir, targetDir);

  // 2. 替换占位符
  replacePlaceholders(targetDir, name);

  // 3. 输出成功信息
  console.log(`✔ Done! cd ${name} && npm install && npm run dev`);
}

function replacePlaceholders(dir, pluginName) {
  // 递归遍历所有文件
  // {{pluginName}} → my-cool-plugin
  // {{displayName}} → My Cool Plugin (camelCase → Title Case)
}

function copyDir(src, dest) {
  // 递归复制目录
}
```

---

## 四、模板文件——plugin.json

```json
{
  "name": "{{pluginName}}",
  "version": "0.1.0",
  "entry": "src/index.tsx",
  "pluginRole": "view",
  "iconSource": "lucide",
  "icon": "Puzzle",
  "appearsIn": {
    "iconBar": "top",
    "sidePanel": true
  },
  "contributes": {
    "viewsContainers": {
      "sidePanel": {
        "title": "{{displayName}}",
        "icon": "Puzzle"
      }
    },
    "views": {
      "main": {
        "title": "{{displayName}}"
      }
    },
    "commands": [],
    "menus": {},
    "i18n": {
      "en": "i18n/en.json"
    }
  }
}
```

---

## 五、模板文件——src/index.tsx

```tsx
import React from "react";

export default function {{displayName}}View({ isActive }: { isActive: boolean }) {
  if (!isActive) return null;

  return (
    <div style={{ padding: "20px" }}>
      <h2>{{displayName}}</h2>
      <p>✅ Your plugin is working!</p>
      <p>Start editing <code>src/index.tsx</code></p>
    </div>
  );
}
```

---

## 六、模板文件——package.json

```json
{
  "name": "{{pluginName}}",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "linkdesk-plugin-sdk dev",
    "build": "linkdesk-plugin-sdk build",
    "validate": "linkdesk-plugin-sdk validate"
  },
  "dependencies": {
    "@linkdesk/plugin-sdk": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0"
  }
}
```

---

## 七、发布到 npm

```bash
cd packages/create-linkdesk-plugin
npm publish --access public
```

npm 自动识别 `create-*` 前缀包名为 `npm create` 的别名：
- `npm create linkdesk-plugin` → 自动下载 `create-linkdesk-plugin` → 执行 `index.js`

无需额外配置。

---

---

## 八、审视实锤（2026-08-30 第 2.1 轮——#21-#23 模板 E5.6→E5.8 换代依据）

> 2026-08-30 第 2.1 轮整轮审视（E6#21-#23 脚手架）落笔的修正实锤。清单只留修正结论 + 本锚点。

### 8.1 模板 plugin.json 是 E5.6 schema——照原样生成的插件 E5.8 加载不了

| 设计稿模板（E5.6 时代） | E5.8 实测真相 | 依据 |
|:--|:--|:--|
| `contributes.views: { "main": { "title": "…" } }`（对象、无 render） | `views: { "<containerId>": [ { id, title, render, order } ] }`——**数组，render 指向视图文件** | `plugins/user/panel-demo/plugin.json` 实锤 |
| `viewsContainers.sidePanel: { title, icon }` | `viewsContainers: { "<id>": { title, location } }`，location 枚举 `sidebar/panel/auxiliarybar` | `public/schemas/plugin.schema.json:523-527` |
| `pluginRole: "view"` | 真实插件用 `factoryRole`（settings 用 `"factoryRole": "settings"`） | `plugins/builtin/settings/plugin.json` |
| 缺 `$schema` / `distribution` / `entry` 对齐 | 第三方默认 `distribution: "user"`（schema:41-46） | schema 实锤 |

**结论：** 模板 plugin.json 按 E5.8 schema 重写——`$schema` 指向 plugin.schema.json + `factoryRole` + `appearsIn` + `viewsContainers(location)` + `views` 数组含 `render` + `entry` + `contributes.i18n`，参照 `plugins/user/panel-demo` 最小视图插件。

### 8.2 模板组件契约过时 + devDependencies 缺 react 类型

- **契约：** 设计稿 `{ isActive }: { isActive: boolean }`；E5.8 真实契约 `{ isActive?: boolean; tabId?: string; sourceId?: string }`（`plugins/builtin/editor/src/index.tsx:8` 实锤）。模板组件签名对齐。
- **样式：** 设计稿模板用内联 `style={{ padding: "20px" }}` 硬编码——改为示范共享 CSS 变量（var(--xxx)）。
- **类型：** 模板 `src/index.tsx` `import React` → tsc 需 react 类型；设计稿模板 devDependencies 只有 `typescript`。补 `@types/react`。模板结构含 `tsconfig.json` 但设计稿无内容——补要点：`jsx: "react-jsx"` + `types` 引 `@linkdesk/plugin-sdk`。

### 8.3 #23a 发布登录态前置同步

#23a 有 `--registry` 参数（对齐 #2.5b），缺 #2.5b 的 npm 登录态前置——2026-08-30 实测 `npm whoami --registry=https://registry.npmjs.org` 返回 **401**，发布前必须 `npm login`（用户 fengyili）。同步 E6#6b 的 whoami 确认写法到 #23a。

### 8.4 设计稿对应任务号更新

设计稿头部「对应任务：E6#9-#11」是 E5.6 时代编号——脚手架现在是 **E6#21-#23**。已同步更新头部。

---

> **← 上一层：** `../01-插件独立构建/`
> **→ 下一文档：** `02-本地预览环境.md`
