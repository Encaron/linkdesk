#ifndef __LCD_INIT_H
#define __LCD_INIT_H

#include "gpio.h"
#include <math.h>
#include "stm32f4xx_hal.h"

#define USE_HORIZONTAL 0  //设置横屏或者竖屏显示 0或1为竖屏 2或3为横屏


#if USE_HORIZONTAL==0||USE_HORIZONTAL==1
#define LCD_W 240
#define LCD_H 280

#else
#define LCD_W 280
#define LCD_H 240
#endif



//-----------------LCD端口定义----------------
// 新的基于HAL库的引脚控制定义 (可放在lcd.h中)
//#define LCD_SCLK_Clr()    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_13, GPIO_PIN_RESET)  //PB13
//#define LCD_SCLK_Set()    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_13, GPIO_PIN_SET)    //CLK
//
//#define LCD_MOSI_Clr()    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_15, GPIO_PIN_RESET)  //PB15
//#define LCD_MOSI_Set()    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_15, GPIO_PIN_SET)   //MOSI

#define LCD_RES_Clr()     HAL_GPIO_WritePin(GPIOE, GPIO_PIN_5, GPIO_PIN_RESET)  //PE5
#define LCD_RES_Set()     HAL_GPIO_WritePin(GPIOE, GPIO_PIN_5, GPIO_PIN_SET)    //RES

#define LCD_DC_Clr()      HAL_GPIO_WritePin(GPIOE, GPIO_PIN_6, GPIO_PIN_RESET)  //PE6
#define LCD_DC_Set()      HAL_GPIO_WritePin(GPIOE, GPIO_PIN_6, GPIO_PIN_SET)    //DC

#define LCD_CS_Clr()      HAL_GPIO_WritePin(GPIOE, GPIO_PIN_7, GPIO_PIN_RESET)  //PE7
#define LCD_CS_Set()      HAL_GPIO_WritePin(GPIOE, GPIO_PIN_7, GPIO_PIN_SET)    //CS

#define LCD_BLK_Clr()     HAL_GPIO_WritePin(GPIOD, GPIO_PIN_12, GPIO_PIN_RESET)  //PD12
#define LCD_BLK_Set()     HAL_GPIO_WritePin(GPIOD, GPIO_PIN_12, GPIO_PIN_SET)   //BLK




void LCD_GPIO_Init(void);//初始化GPIO
void LCD_Writ_Bus(uint8_t dat);//模拟SPI时序
void LCD_WR_DATA8(uint8_t dat);//写入一个字节
void LCD_WR_DATA(uint16_t dat);//写入两个字节
void LCD_WR_REG(uint8_t dat);//写入一个指令
void LCD_Address_Set(uint16_t x1,uint16_t y1,uint16_t x2,uint16_t y2);//设置坐标函数
void LCD_Init(void);//LCD初始化


// DMA相关函数声明 - 修复这里！
void LCD_DMA_Init(void);
void LCD_WR_DATA_DMA(uint16_t color, uint32_t count);
uint8_t LCD_DMA_WaitForCompletion(uint32_t timeout_ms);  // 统一函数声明
void LCD_SPI_Optimize(void);


#endif




