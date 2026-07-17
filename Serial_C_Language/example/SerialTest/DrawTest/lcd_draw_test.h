/*
 * lcd_draw_test.h
 *
 *  Author: FengYiLi
 * Description: Serial Monitor V2 LCD 绘图测试模块
 *              接收 [lcd,type,...] 命令 → 解析 → LCD 240x280 绘图
 *
 * 协议: [lcd,type,params...]  (区别于 OLED 的 [draw,...])
 * 颜色: #RRGGBB 24bit → RGB565 16bit
 */

#ifndef LCD_DRAW_TEST_H_
#define LCD_DRAW_TEST_H_

#include "main.h"
#include "../../HardWare/LCD169/lcd.h"

/* ===== 公共 API ===== */

void LCD_DrawTest_Init(void);
void LCD_DrawTest_Handle(void);
void LCD_DrawTest_ProcessCommand(const char *cmd);

#endif /* LCD_DRAW_TEST_H_ */
