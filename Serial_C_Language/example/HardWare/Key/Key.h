/*
 * Key.h
 *
 *  Created on: Mar 9, 2025
 *      Author: FengYiLi
 */

#ifndef KEY_KEY_H_
#define KEY_KEY_H_

#include "gpio.h"
#include "main.h"
#include "stm32f4xx_hal.h"

/* ============================ 用户配置区域 ============================ */
/* 注意：以下部分在添加新按键时需要修改 */

// [必须修改] 按键总数配置
#define KEY_COUNT    4   // 按键总数，添加按键时需要增加此数值

// [必须修改] 按键编号定义 - 添加新按键时在此处定义新编号
#define  Key_1  0
#define  Key_2  1
#define  Key_3  2
#define  Key_4  3

// [必须修改] GPIO引脚配置 - 添加新按键时在此处配置对应的GPIO和引脚
#define  Key_GPIO1  GPIOE
#define  Key_Pin_1  GPIO_PIN_1  // 上拉输入 (PE1)
#define  Key_Pin_2  GPIO_PIN_2  // 上拉输入 (PE2)
#define  Key_Pin_3  GPIO_PIN_3  // 上拉输入 (PE3)
#define  Key_Pin_4  GPIO_PIN_4  // 上拉输入 (PE4)

// [可选修改] 按键时间阈值配置（单位：ms）- 可根据需要调整
#define KEY_TIME_DOUBLE              0   // 双击判定时间阈值
#define KEY_TIME_LONG                1000  // 长按判定时间阈值
#define KEY_TIME_REPEAT              100   // 重复触发时间间隔

/* ============================ 无需修改区域 ============================ */

// 按键状态标志位定义（保持外部兼容）
#define KEY_HOLD				0x01     // 按住不放状态
#define KEY_DOWN				0x02     // 按下瞬间
#define KEY_UP					0x04     // 松开瞬间
#define KEY_SINGLE		  		0x08     // 单击
#define KEY_DOUBLE				0x10     // 双击
#define KEY_LONG				0x20     // 长按
#define KEY_REPEAT				0x40     // 重复触发

// 函数声明（保持外部接口不变）
void Key_Init(void);
uint8_t Key_Check(uint8_t n, uint8_t Flag);
void Key_Tick(void);

#endif /* KEY_KEY_H_ */
