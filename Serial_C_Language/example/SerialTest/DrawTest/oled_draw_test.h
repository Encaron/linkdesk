/*
 * oled_draw_test.h
 *
 *  Author: FengYiLi
 * Description: Serial Monitor V2 绘图协议测试模块
 *              解析 [draw,type,...] 命令，驱动 OLED 128x64 显示
 *
 * 协议参考: Docs/MCU/OLED绘图协议.md (10+3条)
 *
 * Usage:
 *   1. main.c 中调用 DrawTest_Init()
 *   2. 主循环中调用 DrawTest_Handle()
 *   3. 从 PC Serial Monitor V2 发送 draw 命令 → OLED 实时显示
 */

#ifndef OLED_DRAW_TEST_H_
#define OLED_DRAW_TEST_H_

#include "main.h"
#include "../../HardWare/OLED/OLED.h"
#include "../../HardWare/Serial/Serial.h"

/* ===== 公共 API ===== */

/**
 * @brief 初始化接收
 * @note 配置 USART1 为方括号协议模式
 */
void DrawTest_Init(void);

/**
 * @brief 主循环处理：检查接收并执行绘图
 * @note 应在主循环中周期性调用
 */
void DrawTest_Handle(void);

/**
 * @brief 处理一条 draw 命令字符串（不含外层方括号）
 * @param cmd 命令内容，如 "draw,rect,10,10,50,30,#FF0000,2"
 */
void DrawTest_ProcessCommand(const char *cmd);

/**
 * @brief 从逗号分隔的字符串中提取第 N 个字段
 * @param src   源字符串
 * @param dst   输出缓冲区
 * @param field  字段索引（0-based）
 * @param max_len 输出缓冲区最大长度
 * @retval 0=成功, -1=字段不存在
 */
int GetField(const char *src, char *dst, int field, int max_len);

#endif /* OLED_DRAW_TEST_H_ */
