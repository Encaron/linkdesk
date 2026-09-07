/**
 * linkdesk-api app 域——主软件产品身份只读面（E6#57，06-主软件更新）。
 * 自 linkdesk-api.ts 拆出（E6#57.2a）——第 14 个命名空间域接口。
 * 依赖方向：app → 无（纯函数签名，零类型依赖）；被聚合器交叉组装。
 *
 * 暴露边界（00-README §三② 2026-08-30 拍板）：只读不写——版本号给第三方可读（市场 minAppVersion
 * 校验 E6#30.8c 消费），更新写命令（下载/重启）是壳私事不开放。ProductInfo（app:getProductInfo
 * 全量身份）非第三方插件面——主软件产品内部（关于页 E6#57.14）用，不进本契约（见 electron/product.ts）。
 */
export interface AppAPI {
  /** app 命名空间——只读产品身份。版本号唯一运行时来源 = 主进程 app.getVersion()（package.json 单点，02 §2.3）。 */
  app: {
    getVersion(): Promise<string>;
  };
}
