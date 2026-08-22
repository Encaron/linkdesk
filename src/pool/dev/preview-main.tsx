/**
 * 池开发预览入口——E5.7#31.6。preview.html 加载，仅 vite dev（入口管道归 #31.7）。
 *
 * 静态 import 顺序 = ESM 执行顺序：mockLinkdesk 模块副作用先安装 window.linkdesk，
 * pool-main 后执行——同步注入零竞态，池走真实代码路径渲染完整壳 UI。
 *
 * 🔴 不动 pool.html 生产路径；生产构建零污染（vite 仅 command==='serve' 打包本入口）。
 */
import "./mockLinkdesk";
import "../pool-main";
