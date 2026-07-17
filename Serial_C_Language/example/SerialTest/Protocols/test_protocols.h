/*
 * test_protocols.h — F4 移植版
 *
 * 公共头文件：串口别名 / 日志宏 / GetField / 模块入口声明
 * 所有 SerialTest 子模块统一 include 此文件
 *
 * 适配说明：
 *   - Serial.h 路径适配为 F4 版 (HardWare/Serial/)
 *   - Serial_PC 已在 F4 Serial.h 中定义，此处不重复
 *   - GetField 用 F4 版签名 int GetField(src,dst,field,max_len)
 *     实现位于 SerialTest/DrawTest/oled_draw_test.c
 *   - TIM6/TIM11 双 PWM 已适配 F4
 *   - Key 模块已集成（PE1~PE4, PF5）
 */

#ifndef TEST_PROTOCOLS_H_
#define TEST_PROTOCOLS_H_

#include "../../HardWare/Serial/Serial.h"
#include <string.h>
#include <stdio.h>

/* ── 日志宏 ── */
#define Log(fmt, ...)  Serial_Printf(&huart1, fmt, ##__VA_ARGS__)

/* ── 协议字段提取（F4 版签名，返回 0=成功 / -1=字段不存在）── */
int GetField(const char *src, char *dst, int field, int max_len);

/* ── 测试模块入口 ── */
void Test_Init(void);
void Test_Handle(const char *raw);
void Test_KeyLoop(void);
void Test_SliderLoop(void);
void Test_KeyProcess(const char *raw);

#endif /* TEST_PROTOCOLS_H_ */
