# Serial C Language — STM32 HAL 串口库

> 一份 `.c` + 一份 `.h`，扔进 CubeMX 工程即可用。
> 专为 **[Serial Monitor V2](https://github.com/Encaron/SerialMonitor)** 配套设计，也适合任何需要串口通信的 STM32 项目。
>
> **🔗 配套测试工程**：[example/](example/) — STM32F407ZGT6 CMake 工程。包含完整的 draw 协议解析 + F5 增量同步 + OLED/LCD 双屏显示 + 双滑杆 PWM + 传感面板 + 波形 + 物理按键。详见 [example/README.md](example/README.md)。

---

## 📑 目录

- [⚡ 快速开始](#-快速开始)
- [📦 API 速查](#-api-速查)
- [🔌 四种协议类型](#-四种协议类型)
- [🖥 与 Serial Monitor V2 配合](#-与-serial-monitor-v2-配合)
- [🛠 接收处理示例](#-接收处理示例与-serial-monitor-v2-配合)
  - [0. 字段提取函数 GetField](#0-必备工具字段提取函数)
  - [1. 完整入门——开关卡 → 点亮 LED](#1-完整入门示例pc-开关卡--stm32-点亮-led)
  - [2. 更多示例——滑杆 / 按键 / 继电器](#2-更多协议处理示例)
  - [3. MCU 主动上报传感数据](#3-mcu-主动上报传感数据)
  - [4. type 路由分发模式](#4-type-路由分发模式推荐工程结构)
- [⚙️ 配置选项](#️-配置选项)
- [📂 文件结构](#-文件结构)
- [❓ 常见问题](#-常见问题)
- [📄 许可](#-许可)

---

## ⚡ 快速开始

### 1. 导入文件

将 `Serial.c` 和 `Serial.h` 复制到 CubeMX 工程的 `Core/Src/` 和 `Core/Inc/` 目录。

### 2. ⚠️ 开启串口中断（必须）

在 CubeMX 中，对你要用的每个 USART：

- **NVIC Settings** → 勾选 `USARTx global interrupt` → 打上 ✅
- **USARTx Mode** → 选择 `Asynchronous`

> 不勾中断 → `HAL_UART_RxCpltCallback` 永不被调用 → 接收功能静默失效。**发送不受影响，接收必开。**

### 3. 配置启用哪个串口

`Serial.h` 顶部默认只启用 USART1：

```c
#define SERIAL_USE_USART1 1   // 启用
#define SERIAL_USE_USART2 0   // 禁用
#define SERIAL_USE_USART3 0   // 禁用
```

用几个改几个。

### 4. 三行初始化 + 一行发送

```c
#include "Serial.h"

int main(void) {
    HAL_Init();
    // ... CubeMX 生成的初始化代码 ...

    // ① 启动接收（协议模式 + 方括号协议）
    UART_InitReceive(SERIAL_DEVICE_1, SERIAL_PROTOCOL, SERIAL_SQUARE_BRACKET);

    while (1) {
        // ② 检查是否收到新消息
        if (UART_GetRxFlag(SERIAL_DEVICE_1)) {
            char *msg = UART_GetRxData(SERIAL_DEVICE_1);  // ③ 取出消息
            // msg = "plot,ch1,1234" ——不含方括号
        }

        // 发送到 PC
        Serial_Printf(&huart1, "[sensor,temp,芯片温度,%.1f]\r\n", 42.5);
        HAL_Delay(500);
    }
}
```

**这就是全部。** 不需要自己写中断回调、状态机、缓冲区管理。

---

## 📦 API 速查

### 发送（6 个函数）

| 函数 | 说明 | 示例 |
|------|------|------|
| `Serial_SendByte(huart, byte)` | 发一个字节 | `Serial_SendByte(&huart1, 0x42)` |
| `Serial_SendArray(huart, arr, len)` | 发字节数组 | `Serial_SendArray(&huart1, data, 4)` |
| `Serial_SendString(huart, str)` | 发字符串 | `Serial_SendString(&huart1, "OK\r\n")` |
| `Serial_SendNumber(huart, num, len)` | 发定长数字 | `Serial_SendNumber(&huart1, 42, 2)` → `"42"` |
| `Serial_Printf(huart, fmt, ...)` | 格式化发送 | `Serial_Printf(&huart1, "Val:%.1f\r\n", 3.14)` |
| `Serial_SendPacket(huart, data, len)` | 发数据包 | `0xFF` + 数据 + `0xFE` |

### 接收（3 个函数 + 1 个回调）

| 函数 | 说明 |
|------|------|
| `UART_InitReceive(device, op_mode, protocol)` | 初始化接收——选设备/模式/协议 |
| `UART_GetRxFlag(device)` | 有新消息？返回 1（自动清标志） |
| `UART_GetRxData(device)` | 取出消息字符串（`\0` 结尾） |
| `UART_GetRxByte(device)` | BYTE 协议专用——取单字节 |

### fputc 重定向（可选便利糖，非必须）

仅当启用 `SERIAL_USE_USART1` 时编译。标准库 `printf()` 自动走 USART1。
**不开启 USART1 不影响任何功能**——所有发送用 `Serial_Printf(&huart2, ...)` 指定串口即可。

```c
printf("Hello from STM32!\r\n");  // → huart1
```

---

## 🔌 四种协议类型

| 协议 | 格式 | 接收触发条件 | 用途 |
|------|------|-------------|------|
| `SERIAL_BYTE` | 单字节 | 每收到一个字节 | 原始字节控制 |
| `SERIAL_PACK` | `0xFF` + 4 字节 + `0xFE` | 收到完整数据包 | 二进制指令 |
| `SERIAL_TEXT` | `@TEXT\r\n` | 收到 `\r\n` | 文本指令 |
| **`SERIAL_SQUARE_BRACKET`** | `[DATA]` | 收到 `]` | **Serial Monitor V2 专用** |

> **推荐**：和 Serial Monitor V2 配合时使用 `SERIAL_SQUARE_BRACKET`——PC 端 `ProtocolParser` 直接解析方括号消息。

---

## 🖥 与 Serial Monitor V2 配合

Serial Monitor V2 的协议系统使用 `[type,arg,...]` 格式。MCU 端只需：

```c
// 传感面板——温度卡
Serial_Printf(&huart1, "[sensor,temp,芯片温度,%.1f]\r\n", temperature);

// 传感面板——状态卡（心跳）
Serial_Printf(&huart1, "[sensor,status,主板,online]\r\n");

// 波形面板——多条曲线
Serial_Printf(&huart1, "[plot,ch1,%d][plot,ch2,%d]\r\n", adc1, adc2);

// 按键面板——按键事件
Serial_Printf(&huart1, "[key,KEY1,press]\r\n");

// OLED 面板——绘图指令（11 种图形 + F5 增量同步）
Serial_Printf(&huart1, "[draw,line,0,0,128,64,#FFFFFF]\r\n");
Serial_Printf(&huart1, "[draw,text,0,0,hello,24,#FFF]\r\n");      // 文字（替代旧 [display,...]）
Serial_Printf(&huart1, "[draw,set,a1,circle,64,32,20,#0F0]\r\n"); // 增量同步
```

PC 端收到后自动解析、路由到对应面板、渲染显示。

**更多协议格式** → [Serial Monitor V2 使用示例](https://github.com/Encaron/SerialMonitor)

---

## 🛠 接收处理示例——与 Serial Monitor V2 配合

Serial Monitor V2 发送协议消息 → STM32 接收 → 解析字段 → 操作硬件 → 回复确认。
以此完成 PC ↔ MCU 双向闭环。

---

### 0. 必备工具——字段提取函数

V2 协议消息以**逗号**分隔字段。以 `[ctrl,led,LED1,on]` 为例：

```
串口接收到的原始字节：  [  c  t  r  l  ,  l  e  d  ,  L  E  D  1  ,  o  n  ]  \r  \n
                                                                  ↑
                                                    Serial.c 状态机在 ']' 处截断
UART_GetRxData 返回：    "ctrl,led,LED1,on"   ← 不含方括号，不含 \r\n，末尾有 \0
                         │    │   │     │
                       字段0 字段1 字段2 字段3
```

`UART_GetRxData` 返回的是不含括号的逗号串。要想操作硬件，必须先把各字段拆出来。下面是你的测试工程中已验证的 `GetField` 实现：

```c
/**
 * @brief  从逗号分隔的字符串中提取第 index 个字段（从 0 开始计数）
 * @param  str     源字符串，如 "ctrl,led,LED1,on"
 * @param  index   字段序号，0=第一个字段，1=第二个字段……
 * @param  out     输出缓冲区，提取结果写入此处（含 '\0' 结尾）
 * @param  outSize 输出缓冲区大小（防止溢出）
 * @retval 无——结果通过 out 参数返回。字段不存在时 out 为空串 ""
 *
 * @example
 *   char type[16];
 *   GetField("ctrl,led,LED1,on", 0, type, sizeof(type));  // type  = "ctrl"
 *   GetField("ctrl,led,LED1,on", 2, type, sizeof(type));  // type  = "LED1"
 *   GetField("ctrl,led,LED1,on", 5, type, sizeof(type));  // type  = ""  (不存在)
 *
 * @note   复用此函数处理所有 V2 协议消息——[plot,...]/[sensor,...]/[key,...] 等同格式
 *         逗号是唯一分隔符，小数点 '.' 不是分隔符——"42.5" 不会被拆断
 */
void GetField(const char *str, int index, char *out, int outSize) {
    // ① 跳到第 index 个逗号之后——start 指向目标字段首字符
    const char *start = str;
    for (int i = 0; i < index; i++) {
        const char *p = strchr(start, ',');     // 找下一个逗号
        if (!p) {                               // 不够 index 个字段
            out[0] = '\0';                      // 返回空串
            return;
        }
        start = p + 1;                          // 越过逗号，指向下一字段开头
    }

    // ② 找到字段结尾——下一个逗号 或 字符串末尾
    const char *end = strchr(start, ',');
    int len = end ? (int)(end - start)          // 逗号间距 = 字段长度
                  : (int)strlen(start);          // 最后一个字段，取到 \0

    // ③ 拷贝到输出缓冲区，防溢出
    if (len >= outSize) len = outSize - 1;      // 截断，留 1 字节给 '\0'
    memcpy(out, start, len);                    // 只拷贝字段内容，不含逗号
    out[len] = '\0';                            // 封口
}
```

---

### 1. 完整入门示例——PC 开关卡 → STM32 点亮 LED

**PC 端操作**：用户在 Serial Monitor V2 的传感面板点下"蓝色LED"开关卡胶囊滑块 → PC 端自动发送：

```
[ctrl,led,LED1,on]\r\n
```

**STM32 端响应**：接收 → 拆字段 → 判断类型和名字 → 操作 GPIO → 回复确认。

```c
/*
 * 示例：PC 开关卡 ↔ STM32 板载 LED (PA5)
 *
 * 硬件：PA5 接 LED（常见 Nucleo / Disco 板默认）
 *       低电平点亮 (RESET=亮, SET=灭)   ← 取决于你的板子，可能反过来
 * 协议：[ctrl,led,LED1,on]  → 亮
 *       [ctrl,led,LED1,off] → 灭
 *
 * 前置条件：
 *   1. CubeMX 已配置 USART1 (Asynchronous) + PA5 (GPIO_Output)
 *   2. CubeMX NVIC 已勾选 USART1 global interrupt ✅
 *   3. Serial.c / Serial.h 已导入工程
 */

#include "Serial.h"            // 本库
#include <string.h>            // strcmp / memcpy / strchr
#include <stdlib.h>            // atof (字符串转浮点)

/* ── 便捷宏：日志输出到 PC 端接收区 ── */
#define Log(fmt, ...)  Serial_Printf(&huart1, fmt, ##__VA_ARGS__)

/* ── main.c 全局：GPIO 初始化（CubeMX 自动生成）── */
extern void SystemClock_Config(void);
extern void MX_GPIO_Init(void);
extern void MX_USART1_UART_Init(void);

int main(void) {
    /* ── CubeMX 生成的系统初始化 ── */
    HAL_Init();                         // HAL 库初始化
    SystemClock_Config();               // 时钟树配置（HSE/PLL/总线分频）
    MX_GPIO_Init();                     // GPIO 引脚初始化（含 PA5）
    MX_USART1_UART_Init();              // USART1 初始化（波特率/数据位/停止位）

    /*
     * 启动串口接收
     *   SERIAL_DEVICE_1   → 使用 USART1（对应 huart1）
     *   SERIAL_PROTOCOL   → 协议模式（单字节中断，状态机逐帧解析）
     *   SERIAL_SQUARE_BRACKET → 方括号协议（收到 ']' 置标志，数据在 rx_buffer）
     */
    UART_InitReceive(SERIAL_DEVICE_1, SERIAL_PROTOCOL, SERIAL_SQUARE_BRACKET);

    /* ── 先给 PC 端发一个就绪信号 ── */
    Log("[sensor,status,STM32,online]\r\n");
    Log("---- Serial Monitor V2 就绪，等待指令 ----\r\n");

    while (1) {
        /*
         * 检查是否有完整消息到达
         * UART_GetRxFlag 返回 1 = 有新消息，返回后自动清标志
         * 轮询速度很快（while(1) 无延迟），不会丢帧
         */
        if (!UART_GetRxFlag(SERIAL_DEVICE_1))
            continue;                   // 没消息 → 继续等

        /*
         * 取出消息字符串
         * 例：PC 发 "[ctrl,led,LED1,on]\r\n"
         *     raw = "ctrl,led,LED1,on"  ← 方括号和 \r\n 已被状态机剥离
         */
        char *raw = UART_GetRxData(SERIAL_DEVICE_1);

        /*
         * 提取第 0 个字段 = 消息类型（type）
         * V2 所有消息的第一个字段都是 type：plot/key/slider/ctrl/sensor/…
         * 路由靠这个字段决定交给哪个 handler
         */
        char type[16];                  // type 字段最长 16 字符足够（实际最长 "joystick"=8）
        GetField(raw, 0, type, sizeof(type));

        // ──────────────── 开关控制 ctrl ────────────────
        // 协议格式：[ctrl,子类型,卡片名,动作]
        // 字段位置：  0    1     2    3
        if (strcmp(type, "ctrl") == 0) {

            char subType[16];           // 子类型：led / relay
            char name[32];              // 卡片名：LED1 / 电源（和 PC 端传感面板卡片名一致）
            char action[8];             // 动作：on / off

            GetField(raw, 1, subType, sizeof(subType));
            GetField(raw, 2, name, sizeof(name));
            GetField(raw, 3, action, sizeof(action));

            /*
             * 按"子类型 + 卡片名"匹配目标设备
             * 同一块板子上可以有多个 LED、多个继电器——靠 name 区分
             */
            if (strcmp(subType, "led") == 0 && strcmp(name, "LED1") == 0) {

                if (strcmp(action, "on") == 0) {
                    /*
                     * 点亮 PA5
                     * GPIO_PIN_RESET = 拉低 → LED 阳极接 VCC 的板子亮
                     * 如果你的板子是 GPIO_PIN_SET 亮，对调下面两行
                     */
                    HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, GPIO_PIN_RESET);
                    Log("[ctrl,led,LED1,on] → PA5 RESET → 点亮\r\n");

                } else if (strcmp(action, "off") == 0) {
                    HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, GPIO_PIN_SET);
                    Log("[ctrl,led,LED1,off] → PA5 SET → 熄灭\r\n");
                }
                /*
                 * 注意：Log 发回的确认消息会在 PC 端接收区显示，
                 * 同时 Serial Monitor V2 的开关卡会等待 MCU 回执
                 * [sensor,status,…] 来更新卡片状态，这里只是调试日志
                 */
            }
        }

        // ── 更多 type 分支在此扩展（见下面示例）──
        // if (strcmp(type, "slider") == 0) { ... }
        // if (strcmp(type, "key")    == 0) { ... }
        // if (strcmp(type, "draw")   == 0) { ... }
    }
}
```

---

### 2. 更多协议处理示例

#### 滑杆 → PWM 调光

```
PC 端拖滑杆 → [slider,Slider1,75.5]\r\n  → STM32 拆出 "75.5" → 设 TIM CCR
```

```c
// ── 滑杆控制 PWM 占空比 ──
// 硬件：TIM2_CH1 (PA0) 接 LED，CubeMX 配置 PWM Output
//       也可以改用 TIM6 软件 PWM——定时中断里手动翻 GPIO
if (strcmp(type, "slider") == 0) {

    char name[32];                      // 滑杆名，和 PC 端 Sliders 页面的名字一致
    char valStr[16];                    // 滑杆值，字符串形式。例："75.5"

    GetField(raw, 1, name, sizeof(name));
    GetField(raw, 2, valStr, sizeof(valStr));

    /*
     * 一块板子可以有多个滑杆——kp / ki / kd / led_pwm……
     * 按 name 匹配目标参数
     */
    if (strcmp(name, "Slider1") == 0) {

        // 字符串 → 浮点数（atof 自动处理小数点）
        float duty = (float)atof(valStr);       // "75.5" → 75.5f

        /*
         * 映射到 PWM 比较寄存器
         * 假设 TIM2 预分频后 ARR=999 → PWM 分辨率 1000 级
         * duty 范围 0~100 → * 10 映射到 0~1000
         */
        TIM2->CCR1 = (uint32_t)(duty / 100.0f * 999);

        // 回复 PC 端——接收区可见当前占空比
        Log("[slider,Slider1,%.1f] → PWM=%.0f%% (CCR1=%lu)\r\n",
            duty, duty, TIM2->CCR1);
    }
}
```

#### 按键事件（保留字符串比较，不取枚举）

```
PC 端按键面板按下 KEY1 → [key,KEY1,on]\r\n
                        松开 → [key,KEY1,off]\r\n
```

```c
// ── 按键事件 ──
// 协议格式：[key,按键名,状态]
// 注意：状态是字符串 "on"/"off"，不是 0/1 枚举
//       V2 协议层不做语义转换，保留字符串方便人读
if (strcmp(type, "key") == 0) {

    char name[32];
    char state[16];                     // "on" 或 "off"（字符串，非 bool）

    GetField(raw, 1, name, sizeof(name));
    GetField(raw, 2, state, sizeof(state));

    /*
     * 你的板子上可能接了物理按键，也可能 PC 端虚拟按键想做其他事
     * 这里只做日志回执，实际 GPIO 操作按需加 if
     *
     * 例：if (strcmp(name, "KEY1") == 0 && strcmp(state, "on") == 0)
     *         HAL_GPIO_WritePin(GPIOB, GPIO_PIN_0, GPIO_PIN_SET);
     */
    Log("按键[%s] → %s\r\n", name, state);
}
```

#### 传感面板继电器控制

```
PC 端点下继电器开关卡 → [ctrl,relay,电源,on]\r\n
```

```c
// ── 继电器控制 ──
// 和 LED 同属 ctrl 大类，只是子类型不同
if (strcmp(type, "ctrl") == 0) {

    char subType[16], name[32], action[8];
    GetField(raw, 1, subType, sizeof(subType));
    GetField(raw, 2, name, sizeof(name));
    GetField(raw, 3, action, sizeof(action));

    /*
     * relay 子类型处理
     * 继电器通常高电平吸合 (SET=合, RESET=断)，和 LED 可能相反
     * 具体极性看你的驱动电路——三极管/MOSFET/光耦驱动方式不同
     */
    if (strcmp(subType, "relay") == 0 && strcmp(name, "电源") == 0) {
        /*
         * GPIO_PIN_SET   = 高电平 → 继电器吸合 → 外部电路接通
         * GPIO_PIN_RESET = 低电平 → 继电器断开 → 外部电路切断
         */
        GPIO_PinState level = (strcmp(action, "on") == 0)
                              ? GPIO_PIN_SET
                              : GPIO_PIN_RESET;
        HAL_GPIO_WritePin(GPIOD, GPIO_PIN_12, level);
        Log("[ctrl,relay,电源,%s] → PD12 %s\r\n",
            action, (level == GPIO_PIN_SET) ? "吸合" : "断开");
    }
}
```

---

### 3. MCU 主动上报传感数据

MCU 不需要等 PC 问——定时把传感器读数发上去，PC 端传感面板自动建卡。

```c
/*
 * 定时上报函数——放在 main while(1) 里，通过 HAL_GetTick() 控制频率
 *
 * PC 端行为：
 *   - 第一次收到 [sensor,temp,芯片温度,25.6] → 自动创建黄色温度卡
 *   - 后续同名字段 → 只更新值 + 迷你波形，不重复建卡
 *   - 2 秒没收到 [sensor,status,...] → 状态卡自动标红 offline
 */
void Sensor_Report(void) {
    static uint32_t last_ms = 0;            // 上次上报时刻（ms）
    uint32_t now = HAL_GetTick();           // 系统滴答（1ms 分辨率）

    if (now - last_ms < 500) return;        // 每 500ms 上报一次，波特率低可放宽
    last_ms = now;

    /*
     * ── 环境传感器（温湿度）──
     * 实际读数来自 HDC1080 / DHT22 / SHT30 / AHT20……
     * 这里用常量演示格式，真实项目替换为传感器读取函数
     */
    float temp  = 25.6f;                    // 温度 °C ——替换为 Temp_Read()
    float humid = 68.2f;                    // 湿度 %  ——替换为 Hum_Read()

    // [sensor,temp,卡片名,值]
    Serial_Printf(&huart1,
        "[sensor,temp,芯片温度,%.1f]\r\n", temp);

    // [sensor,humidity,卡片名,值]
    Serial_Printf(&huart1,
        "[sensor,humidity,ambient,%.1f]\r\n", humid);

    /*
     * ── 电机转速（带辅助参数 PWM 占空比）──
     * 协议：[sensor,motor,电机名,RPM值,PWM占空比%]
     *       字段4 (值)        → 大数字 2450 RPM（紫色）
     *       字段5 (辅助参数)  → 小字 "85"（PWM 占空比），可选
     */
    uint32_t rpm      = 2450;               // 编码器/霍尔传感器读数
    uint8_t  duty_pct = 85;                 // PWM 占空比 %

    Serial_Printf(&huart1,
        "[sensor,motor,电机1,%lu,%u]\r\n", rpm, duty_pct);

    /*
     * ── 设备心跳（状态卡）──
     * PC 端计时器：每次收到 [sensor,status,主板,online] 重置 2s 倒计时
     *            超时未收到 → 卡片自动绿变红，值 online → offline
     *            固件挂了/串口断了 → PC 端自动感知，不需要固件发 offline
     *
     * 死人不会打电话报丧——这是心跳机制的关键设计
     */
    Serial_Printf(&huart1,
        "[sensor,status,主板,online]\r\n");
}
```

> 💡 **中段留空**：当传感器暂时读不到值，用双逗号留空字段。PC 端卡片显示 `--`，不画波形。
> ```c
> Serial_Printf(&huart1, "[sensor,temp,温度,,%.0f]\r\n", duty_pct);
> //                                 ↑↑ 双逗号 → value="" → PC 端显示 "--"
> ```

---

### 4. type 路由分发模式（推荐工程结构）

当协议类型超过 3 种，建议把主循环的 if/else 链升级为统一路由器。
推荐每个 type 一个独立 `.c` 文件——和 PC 端每个面板一个 handler 同构。

```c
/*
 * 路由分发架构：
 *
 *   main while(1)
 *     ├── UART_GetRxFlag  → 收到消息？
 *     │     └── RouteMessage(raw)         ← 统一入口
 *     │           ├── Key_Handle(raw)      ← test_key.c
 *     │           ├── Slider_Handle(raw)   ← test_protocols.c
 *     │           ├── Ctrl_Handle(raw)     ← 新文件
 *     │           └── Draw_Handle(raw)     ← 新文件
 *     │
 *     └── Sensor_Report()                 ← 定时上报（不依赖接收）
 */

// ── 主循环（main.c）──
while (1) {
    /*
     * 轮询接收——非阻塞，不影响其他任务
     * UART_GetRxFlag 内部检查 dev1.rx_flag（ISR 置位），有消息返回 1 并清标志
     */
    if (UART_GetRxFlag(SERIAL_DEVICE_1)) {
        char *raw = UART_GetRxData(SERIAL_DEVICE_1);
        RouteMessage(raw);                  // 统一派发——这一行是唯一入口
    }

    Sensor_Report();                        // 定时上报传感数据（500ms 一次）
    HAL_Delay(10);                          // 给其他任务让路，10ms 足够
}

/*
 * ── 路由函数（单独放在 route.c 或 main.c 头部）──
 *
 * 设计原则：
 *   1. 只读第 0 个字段 → 决定交给谁
 *   2. 每条 if 只判断 type 字符串相等——不做字段解析
 *   3. 新协议只加一行 else if——零侵入
 *   4. raw 原样传给 handler，由 handler 自己拆后续字段
 */
void RouteMessage(const char *raw) {
    char type[16];
    GetField(raw, 0, type, sizeof(type));   // 只拆第 0 个字段——最低开销

    /*
     * type 路由表（按字母序排列，debug 好找）
     *
     * 每个 handler 的职责：
     *   - 自己拆字段（GetField 从 raw 重新取）
     *   - 自己匹配名字（strcmp name）
     *   - 自己操作硬件
     *   - 自己 Log 回执
     */
    if      (strcmp(type, "ctrl")   == 0) Ctrl_Handle(raw);
    else if (strcmp(type, "draw")   == 0) Draw_Handle(raw);
    else if (strcmp(type, "key")    == 0) Key_Handle(raw);
    else if (strcmp(type, "slider") == 0) Slider_Handle(raw);

    /*
     * 以下 type 由 MCU→PC 单向发送，PC 不会发过来：
     *   plot / fft / sensor / joystick / display
     * 所以路由里不必出现它们——MCU 只管发，不处理 PC 对它们的回复
     *
     * 如果你未来需要接收这些 type（如 PC 发 [display-clear]），在这里加即可
     */
}
```

> 📁 **完整测试工程**：[example/](example/) — STM32F407ZGT6 CMake 工程。
> 涵盖：绘图协议解析（OLED/LCD 双屏）+ F5 增量同步 + 双滑杆 PWM + 传感面板模拟
> + 9 种波形 + 物理按键 + OLED 虚拟屏 + 开关控制。
> 详见 [example/README.md](example/README.md)。

---

### 修改缓冲区大小

```c
// Serial.h
#define SERIAL_TEXT_BUF_SIZE 100      // 单条消息最大长度
#define SERIAL_REALTIME_BUF_SIZE 1024 // 实时模式缓冲区
```

### 自定义设备别名

```c
// main.h 或自己头文件
#define Serial_PC     SERIAL_DEVICE_1   // 连 PC
#define Serial_WIFI   SERIAL_DEVICE_2   // 连 WiFi 模块
#define Serial_BT     SERIAL_DEVICE_3   // 连蓝牙

// 使用
UART_InitReceive(Serial_PC, SERIAL_PROTOCOL, SERIAL_SQUARE_BRACKET);
Serial_Printf(&huart1, "Hello\r\n");
```

### 实时大数据模式（接收图片/长数组）

```c
// 初始化：用空闲中断接收大数据（如 [draw,...] 图片数据）
UART_InitReceive(SERIAL_DEVICE_1, SERIAL_REALTIME, SERIAL_SQUARE_BRACKET);

// 数据到达后：
//   dev1.rx_flag = 1
//   数据在 realtime_buffer 中（全局数组）
//   长度通过 HAL_UARTEx_RxEventCallback 的 Size 参数获取
```

---

## 📂 文件结构

```
Serial_C_Language/
├── Serial.c              # 发送 + 接收状态机 + 中断回调（490 行）
├── Serial.h              # 接口声明 + 配置宏 + 枚举（126 行）
├── README.md             # 本文件
└── example/              # STM32F407 CMake 演示工程
    ├── Core/             #  main.c + CubeMX 生成代码
    ├── Drivers/          #  CMSIS + HAL
    ├── HardWare/         #  OLED / LCD / Serial / Key 驱动
    ├── SerialTest/       #  绘图 / 滑杆 / 传感器 / 波形 / 按键 / 虚拟屏
    └── cmake/            #  CMake 工具链 + 构建配置
```

> 就两个文件，无依赖，零 malloc，静态分配全部缓冲区。

---

## ❓ 常见问题

**Q: 接收不到数据，但发送正常？**
99% 是没在 CubeMX 里开串口中断。NVIC 页签 → `USARTx global interrupt` → 勾上 ✅ → 重新编译。

**Q: 支持哪些 STM32 系列？**
只要用 HAL 库就支持。已在 STM32H743 和 STM32F407 上验证，F1/G0/L4 理论兼容。

**Q: 能同时用多个串口吗？**
能。`UART_InitReceive(SERIAL_DEVICE_1, ...)` + `UART_InitReceive(SERIAL_DEVICE_2, ...)`——各自独立接收，发送时指定 `huart` 即可。

**Q: 实时模式和协议模式有什么区别？**
协议模式每收一个字节进中断→状态机处理→消息完整后置标志。实时模式用空闲中断一次接收大块数据（适合图片上传等大数据场景）。

**Q: 中断回调会和 CubeMX 生成的冲突吗？**
`HAL_UART_RxCpltCallback` 和 `HAL_UARTEx_RxEventCallback` 是 HAL 的弱定义回调——CubeMX 不生成这两个函数体，Serial.c 的实现会覆盖弱定义。如果你已有自己的回调实现，把 Serial.c 里的逻辑合并过去即可。

**Q: 为什么 USART1 printf 重定向没生效？**
检查 `SERIAL_USE_USART1` 是否为 `1`。另外不推荐依赖重定向——用 `Serial_Printf(&huart1, ...)` 明确指定串口更安全。

---

## 📄 许可

MIT License — 随便用，改了不用回馈。
