// TypeScript 编译输出到 dist-electron/，根 package.json 有 "type": "module"，
// 但 Electron 主进程代码是 CommonJS。此文件覆盖为 commonjs 避免 ES module 错误。
const fs = require('fs');
fs.writeFileSync('dist-electron/package.json', JSON.stringify({ type: 'commonjs' }));
