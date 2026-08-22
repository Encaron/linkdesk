# create-linkdesk-plugin 脚手架

> 对应任务：E6#9-#11。对标 `yo code`（VS Code Extension Generator）。
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

> **← 上一层：** `../01-插件独立构建/`
> **→ 下一文档：** `02-本地预览环境.md`
