/*
 * 04「启动过场」④A 读侧——主题快照铺底（public/ 单源：index.html 与 pool.html 同一份文件）。
 * 首次绘制之前同步执行：把上次权威主题的全量变量原样写回 documentElement。
 * 快照坏 / 版本不符 / 关键键缺失 → 什么都不做（现状 :root 暗兜底）——不重试、不写默认值、不刷日志。
 * 写侧与校验的 TS 对照实现 = src/core/services/ui/ThemeEngine/snapshot.ts（key: ldk.theme.snapshot.v1）。
 * 🔴 本文件是镜像层：不许在这里加任何主题逻辑（01-设计 §九 2）。
 */
(function () {
  try {
    var raw = localStorage.getItem("ldk.theme.snapshot.v1");
    if (!raw) return;
    var s = JSON.parse(raw);
    if (!s || s.v !== 1 || typeof s.type !== "string" || !s.type) return;
    if (typeof s.vars !== "object" || s.vars === null) return;
    var required = ["--bg-window", "--text-primary"];
    for (var i = 0; i < required.length; i++) {
      if (typeof s.vars[required[i]] !== "string" || !s.vars[required[i]]) return;
    }
    var root = document.documentElement;
    root.setAttribute("data-theme", s.type);
    for (var k in s.vars) {
      if (Object.prototype.hasOwnProperty.call(s.vars, k)) root.style.setProperty(k, s.vars[k]);
    }
  } catch (e) {
    /* 快照坏 = 现状兜底，静默 */
  }
})();
