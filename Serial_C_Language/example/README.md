# Serial Monitor V2 — STM32F4 配套演示工程

> STM32F407ZGT6 · 配合 [Serial Monitor V2](https://github.com/Encaron/SerialMonitor) 上位机使用
>
> 涵盖：绘图 / 滑杆 PWM / 传感面板 / 波形 / 按键 / 虚拟屏 / 开关控制

## 硬件引脚

| 外设 | 引脚 | 说明 |
|------|------|------|
| USART1 (PC) | PA9(TX), PA10(RX) | 115200 8N1，连接 Serial Monitor V2 |
| USART3 (BT) | PB10(TX), PB11(RX) | 9600 8N1，蓝牙备用 |
| OLED 0.96" 128×64 | PA8(SCL), PC9(SDA) | 软件 I2C，单色 |
| LCD 1.69" 240×280 | PB13(SCK), PB15(MOSI), PE7(CS), PE5(RES), PE6(DC), PD12(BLK) | SPI，彩色 |
| LED (PC13) | PC13 | Slider1 呼吸灯 |
| LED (PF7) | PF7 | Slider2 调光 |
| LED (PF8) | PF8 | 蓝色LED 开关 |
| 按键 | PE1(开), PE3(关) | 上拉输入，控制蓝色LED |

## 编译 & 烧录

```bash
cd 工程目录
cmake --preset Debug
cmake --build build/Debug
# 固件：build/Debug/SerialMonitor_DrawTest.elf
```

> **必须用 `cmake --preset Debug`**，不能直接 `cmake -B build` —— 否则找不到 ARM 工具链。

CubeIDE 用户：Open Project from File System → 选工程目录 → 点 Run。

## 功能模块

所有模块入口在 `Core/Src/main.c`，取消注释即可启用。

### 绘图测试（PC 画板 → MCU 屏幕）

| 函数 | 位置 | 说明 |
|------|------|------|
| `DrawTest_Init()` | Init 区 | 初始化 OLED 绘图 |
| `LCD_DrawTest_Init()` | Init 区 | 初始化 LCD 绘图 |
| `OLED_Draw_Test()` | Init 区 | 静态画布（一次性，勿放循环） |

**切换 OLED / LCD**：在 main.c 的 UART 分发区注释对调：
```c
LCD_DrawTest_ProcessCommand(data);      // ← LCD
//DrawTest_ProcessCommand(data);         // ← OLED
```

PC 端画板发 `[draw,...]` 命令即可在屏幕上显示。

### 滑杆 PWM

| 函数 | 说明 |
|------|------|
| `Test_Init()` | 启动双 PWM + 串口接收 |
| `Test_Handle()` | 处理 slider / ctrl / key 协议 |
| `Test_SliderLoop()` | 输出 plot 波形 |

- Slider1 (PC 端) → PC13 呼吸灯
- Slider2 (PC 端) → PF7 调光

### 传感面板

| 函数 | 说明 |
|------|------|
| `Test_SensorInit()` | 随机种子 |
| `Test_SensorLoop()` | 发送温湿压/电机/电池数据 |

发 `[ctrl,slider,电池电压,3.7]` 可控制电池电压值。

### 按键 & 虚拟开关

| 函数 | 说明 |
|------|------|
| `Test_KeyLoop()` | PE1→开 PF8, PE3→关 PF8 |

PC 端也可发 `[ctrl,led,蓝色LED,on/off]` 控制同一个灯。

### 波形发生器

| 函数 | 说明 |
|------|------|
| `Test_WaveformInit(WAVEFORM_SIN)` | 选择波形模式 |
| `Test_WaveformProcess()` | 每帧输出 plot 数据 |

9 种模式：SIN / SQUARE / TRI / SAW / AM / MIXED / NOISE / DAMPED / BURST

### OLED 虚拟屏（`[display,...]` 兼容保留，推荐用 `[draw,text,...]`）

| 函数 | 说明 |
|------|------|
| `Test_DisplayInit()` | 启动画面 |
| `Test_DisplayLoop()` | 动态刷新 |

## 协议速查

| 协议 | 方向 | 示例 |
|------|------|------|
| `[draw,circle,64,32,20,#FFF]` | PC→MCU | 画圆 |
| `[slider,Slider1,75]` | PC→MCU | 滑杆 |
| `[ctrl,led,蓝色LED,on]` | 双向 | 开关 |
| `[ctrl,slider,电池电压,3.7]` | PC→MCU | 设电池值 |
| `[sensor,temp,芯片温度,42.5]` | MCU→PC | 温度卡 |
| `[plot,Slider1,75.0]` | MCU→PC | 波形数据 |
| `[draw,text,0,0,hello,24,#FFF]` | MCU→PC | 文字（替代旧 display） |
| `[draw,set,a1,circle,64,32,20,#0F0]` | PC→MCU | F5 增量同步 |
| `[draw,del,a1]` | PC→MCU | F5 删除图形 |

完整协议见 [Serial Monitor V2 文档](https://github.com/Encaron/SerialMonitor)。

## CubeMX 再生后注意事项

CubeMX 重新生成代码后需检查：

### ⚠️ 源头修复 — 改 `.ioc`（一劳永逸）
以下在 CubeMX 里改完直接 Generate Code，无需手动改 C：
- **PF7 引脚**：Pinout 视图 → PF7 选 `TIM11_CH1`，PB9 解绑
- **TIM11**：Period=999, Prescaler=83（匹配 Slider2 0~999 分辨率）
- **TIM6**：Prescaler=239, Period=99（匹配 Slider1 软件 PWM）

### 手动补丁 — `.ioc` 管不到的
- 栈大小 `_Min_Stack_Size = 0x1000`（`STM32F407XX_FLASH.ld`）
- `-u _printf_float` 链接选项
- `stm32f4xx_it.c` 补 `extern htim6` + `TIM6_DAC_IRQHandler`
