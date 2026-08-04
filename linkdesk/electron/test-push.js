/**
 * E5#74e 自动化测试：检测 plugin:push 是否到达插件 WebView
 * 在 preload-plugin.ts 中调用：require('./test-push').installTest(ipcRenderer)
 */
const fs = require('fs');
const path = require('path');
const LOG_FILE = path.join(require('electron').app.getPath('userData'), 'plugin-push-test.log');

module.exports = {
  installTest(ipcRenderer) {
    // 1. 记录注册
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] preload 加载——注册 plugin:push 监听\n`);

    // 2. 监听 plugin:push
    ipcRenderer.on('plugin:push', (_event, data) => {
      fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ★ plugin:push 收到! channel="${data.channel}" source="${data.source}"\n`);
    });

    // 3. 5 秒后如果没有收到——超时标记
    setTimeout(() => {
      fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ⚠️ 5s timeout——可能从未收到 plugin:push\n`);
    }, 5000);
  }
};
