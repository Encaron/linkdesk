/*
 * test_sensor.c
 *
 * 传感面板模拟 —— 7 种传感器卡片，每 50ms 发送一组随机数值
 *
 * 协议规范（PC 端解析）：
 *   [sensor,temp,芯片温度,42.5,45.0]   → 黄色温度卡（主值 + 辅参 + 波形）
 *   [sensor,humidity,ambient,68.2]     → 蓝色湿度卡（值 + 进度条 + 波形）
 *   [sensor,pressure,大气压,1013.2]    → 青色气压卡（值 + 进度条）
 *   [sensor,status,主板,online]        → 绿色状态卡
 *   [ctrl,led,蓝色LED,on]              → 橙色开关卡 + 胶囊滑块
 *   [sensor,motor,电机1,2450,85]       → 紫色电机卡（RPM + 占空比）
 *   [sensor,generic,电池电压,3.72]     → 灰色通用卡
 */
#include "test_sensor.h"
#include "../../HardWare/Serial/Serial.h"
#include <stdlib.h>

float sensor_batt = 3.30f;  // 电池电压，可通过 [ctrl,slider,电池电压,v] 控制

// ── 固定值版本（保留参考）─────────────────────────────────────────
//   Serial_Printf(&huart1, "[sensor,temp,芯片温度,42.5,45.0]\r\n");
//   Serial_Printf(&huart1, "[sensor,humidity,ambient,68.2]\r\n");
//   Serial_Printf(&huart1, "[sensor,pressure,大气压,1013.2]\r\n");
//   Serial_Printf(&huart1, "[sensor,status,主板,online]\r\n");
//   Serial_Printf(&huart1, "[ctrl,led,蓝色LED,on]\r\n");
//   Serial_Printf(&huart1, "[sensor,motor,电机1,2450,85]\r\n");
//   Serial_Printf(&huart1, "[sensor,generic,电池电压,3.72]\r\n");

// ── 初始化（随机种子 + 初始状态）─────────────────────────────────
void Test_SensorInit(void)
{
    srand(HAL_GetTick());
    /* 蓝色LED 初始状态由物理按键控制，不在此设置 */
}

// ── 每 50ms 调用一次，生成随机传感数据 ────────────────────────────
void Test_SensorLoop(void)
{
    float t1 = 30.0f + (rand() % 400) / 10.0f;      // 温度 30.0~69.9 °C
    float t2 = 35.0f + (rand() % 150) / 10.0f;      // 辅参 35.0~49.9 °C
    float hum = 30.0f + (rand() % 600) / 10.0f;     // 湿度 30.0~89.9 %
    float press = 980.0f + (rand() % 600) / 10.0f;  // 气压 980.0~1039.9 hPa
    const char *sts = (rand() & 1) ? "online" : "offline";
    int rpm  = 1000 + rand() % 4001;                // 电机 1000~5000 RPM
    int duty = rand() % 101;                         // 占空比 0~100
    Serial_Printf(&huart1, "[sensor,temp,芯片温度,%.1f,%.1f]\r\n", t1, t2);
    Serial_Printf(&huart1, "[sensor,humidity,ambient,%.1f]\r\n", hum);
    Serial_Printf(&huart1, "[sensor,pressure,大气压,%.1f]\r\n", press);
    Serial_Printf(&huart1, "[sensor,status,主板,%s]\r\n", sts);
    /* 蓝色LED 开关由物理按键 PE1/PE3 → Test_KeyLoop 控制，不在此随机切换 */
    Serial_Printf(&huart1, "[sensor,motor,电机1,%d,%d]\r\n", rpm, duty);
    Serial_Printf(&huart1, "[sensor,generic,电池电压,%.2f]\r\n", sensor_batt);
}
