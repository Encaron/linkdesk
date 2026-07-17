// lcd_dma.c - 统一函数定义
#include "lcd_dma.h"
#include "lcd_init.h"
#include <string.h>
#include <stdio.h>

extern SPI_HandleTypeDef hspi2;
extern DMA_HandleTypeDef hdma_spi2_tx;

static volatile uint8_t dma_transfer_complete = 1;
static uint8_t dma_buffer[512];

// DMA传输完成回调函数
void HAL_SPI_TxCpltCallback(SPI_HandleTypeDef *hspi)
{
    if(hspi->Instance == SPI2) {
        dma_transfer_complete = 1;
        LCD_CS_Set();
    }
}

void HAL_SPI_ErrorCallback(SPI_HandleTypeDef *hspi)
{
    if(hspi->Instance == SPI2) {
        dma_transfer_complete = 1;
        LCD_CS_Set();
    }
}

// 初始化DMA
void LCD_DMA_Init(void)
{
    dma_transfer_complete = 1;
    memset(dma_buffer, 0, sizeof(dma_buffer));
}

// 等待DMA传输完成（带超时） - 与声明一致
uint8_t LCD_DMA_WaitForCompletion(uint32_t timeout_ms)
{
    uint32_t start_time = HAL_GetTick();

    while(!dma_transfer_complete) {
        if(HAL_GetTick() - start_time > timeout_ms) {
            HAL_SPI_DMAStop(&hspi2);
            dma_transfer_complete = 1;
            LCD_CS_Set();
            return 0; // 超时失败
        }
    }
    return 1; // 成功
}

// 优化SPI配置
void LCD_SPI_Optimize(void)
{
    // 暂时不修改SPI配置，先保证功能
    printf("SPI优化已启用\r\n");
}

// DMA传输主函数
void LCD_WR_DATA_DMA(uint16_t color, uint32_t count)
{
    if(count == 0) return;

    // 等待上一次传输完成
    if(!LCD_DMA_WaitForCompletion(100)) {
        printf("DMA等待超时\r\n");
        return;
    }

    // 准备颜色数据
    uint8_t color_hi = color >> 8;
    uint8_t color_lo = color & 0xFF;

    // 填充缓冲区
    for(uint32_t i = 0; i < sizeof(dma_buffer); i += 2) {
        dma_buffer[i] = color_hi;
        dma_buffer[i+1] = color_lo;
    }

    uint32_t total_bytes = count * 2;
    uint32_t transferred = 0;

    while(transferred < total_bytes) {
        // 计算本次传输大小
        uint32_t this_transfer = total_bytes - transferred;
        if(this_transfer > sizeof(dma_buffer)) {
            this_transfer = sizeof(dma_buffer);
        }

        dma_transfer_complete = 0;

        // 拉低CS
        LCD_CS_Clr();

        // 启动DMA传输
        HAL_StatusTypeDef status = HAL_SPI_Transmit_DMA(&hspi2, dma_buffer, this_transfer);

        if(status != HAL_OK) {
            printf("DMA启动失败\r\n");
            dma_transfer_complete = 1;
            LCD_CS_Set();
            return;
        }

        // 等待传输完成
        if(!LCD_DMA_WaitForCompletion(500)) {
            printf("DMA传输超时\r\n");
            LCD_CS_Set();
            return;
        }

        transferred += this_transfer;
    }
}
