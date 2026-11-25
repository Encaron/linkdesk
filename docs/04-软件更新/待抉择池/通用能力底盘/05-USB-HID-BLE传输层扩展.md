# USB HID / BLE 传输层扩展（AI 门外契约面补齐 · 增强版）

> **状态：待硬件**（2026-11-25 立项）· 归属：通用能力底盘（轴三「连接/端点登记」）
> **一句话**：给宿主补 `hid` / `ble` 两个 `DeviceTransport`，让 USB HID 与低功耗蓝牙设备
> 也能走 03 的会话契约；**前提是用户手上有对应硬件可实测**，否则不做。

## 一、为什么现在不做

- 池插件没有 Node/OS 权限（硬约束：硬件所有权在主进程）——HID/BLE 必须由宿主提供 transport；
- 用户当前**没有 HID/BLE 硬件**，没有真机就跑不出「拔插/重连/权限」这类真问题，
  按项目纪律（实测驱动，⛔ 只写代码不验收）**不提前造**。

## 二、已有的地基（不用重做）

- `electron/services/deviceSession/`：`DeviceTransport` 接口 ＋ 会话注册表（属主/幂等/僵尸/recover）已就位；
- `serial`（串口）与 `tcp`（网口）已落地，作为两个参照实现；
- 能力闸已有 `deviceTransports` 根字段——新 transport 只需在插件清单里多一个名字；
- 夹具模式（`dev-fixtures/device-probe`）已证明“第二个作者只读规格、不看 serial 源码”可做全。

## 三、要补的（拿到硬件后）

1. **HID transport**（`id:"hid"`）
   - 打开：`node-hid`（或 `hidapi` 绑定）按 VID/PID/序列号打开；`deviceKey` 约定 `hid:<vid>:<pid>[:serial]`；
   - 热插拔：`node-hid` 无事件 ⇒ 定时 `HID.devices()` 差分（低频，⛔ 忙轮询）；产出 `device.added/removed`；
   - 权限：Windows 下非标准 HID 需 WinUSB/libusb 驱动，文档要写清（这是真机才会踩的坑）。
2. **BLE transport**（`id:"ble"`）
   - 扫描/连接：`@abandonware/noble`（主进程）；`deviceKey` 约定 `ble:<address|name>`；
   - 断连事件 → 句柄死 → 注册表判 `stale`（复用 03 的 `recover`）；
   - Windows 10+ 蓝牙栈权限、配对状态、MTU——同样是真机问题。
3. **打包**：两个原生依赖都要进 electron-builder 的 `asarUnpack`/重建链（与 serialport 同款），
   并在 `check-packaging-files` / 冷启动冒烟里补一条（⛔ 只测 dev）。
4. **事件面**：`device.added/removed` 首批走 04 事件总线（本项依赖 04 已落地）。

## 四、验收（拿到硬件后）

1. 第二/第三个设备插件（如 HID 旋钮、BLE 传感器）**只读 `03 §8.2` 规格**即可实现 acquire/release/getState/recover，不引用 serial 代码；
2. 拔插语义与 3a 同口径：拔掉 ⇒ `open:false/stale:true`；插回 ⇒ `recover` 成功且耗时可见；
3. `doctor` 设备断言对 `--profile hid-*` / `ble-*` 成立；
4. 冷启动打包实例能加载原生依赖（非 dev 环境验证）。

## 五、不做的代价

- AI 只能控制「串口/TCP」两类物理设备；HID/BLE 设备必须各写一个壳外桥（又回到“每个设备一套适配”）；
- 常见的旋钮/手柄/传感器/穿戴设备进不了 LinkDesk 生态。

## 六、依赖与排期

- 依赖：03（会话契约）✅、04（事件总线）✅、用户提供 HID/BLE 硬件；
- 排期：**等硬件到位再开**；开工时先补本页 §三 的实测清单，再动代码。
