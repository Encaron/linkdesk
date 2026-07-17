// lcd_dma.h - 简化版本
#ifndef __LCD_DMA_H
#define __LCD_DMA_H

#include "main.h"
#include "spi.h"

// 函数声明 - 与lcd_init.h一致
void LCD_DMA_Init(void);
void LCD_WR_DATA_DMA(uint16_t color, uint32_t count);
uint8_t LCD_DMA_WaitForCompletion(uint32_t timeout_ms);
void LCD_SPI_Optimize(void);

#endif
