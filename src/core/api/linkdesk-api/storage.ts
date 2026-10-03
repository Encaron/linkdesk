/**
 * linkdesk-api 存储域——「打开缓存目录」设置行（04-软件更新/待抉择池/设置页-打开缓存目录 3.3）。
 * 🔴 **壳侧独有**（池 preload 不注入——消费方 = 设置页 action/status 命令的 handler，跑在壳进程）
 *   ⇒ 命名空间面必须 `?` 可选（同 `bridge?` / `hotExit?` 的单侧独有惯例——写成必选
 *   等于谎称池里也注入，池侧代码会照着不存在的面写）。
 * 依赖方向：被聚合器交叉组装；实现 = electron/preload-shell.ts（storage 命名空间）。
 */

/** 存储命名空间面——当前生效缓存目录的读数口与打开口（解析单点在主进程 storage-handlers） */
export interface StorageAPI {
  storage?: {
    /** 打开缓存目录（资源管理器窗口，非模态）——主进程解析当前生效路径，**先建目录再开**
     *  （目录缺省也建——刚装完没跑过也有得开，绝不弹"找不到"）；openPath 失败抛错 fail-loud */
    revealCache(): Promise<void>;
    /** 当前生效的缓存目录绝对路径——settings.json 的 `app.storage.cacheDir`（空/缺 = userData 默认位）；
     *  🔴 解析唯一入口（落点契约铁律 3：任何地方不存第二份路径，取不抄） */
    cacheDir(): Promise<string>;
  };
}
