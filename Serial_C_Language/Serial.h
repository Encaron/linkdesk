/*
 * Serial.h
 *
 * Created on: Nov 3, 2021
 *      Author: FengYiLi
 * Description: 串口通信模块 - 结构体封装版，支持按需启用USART
 *              简洁统一接口，无兼容遗留变量
 *
 * History:
 *   2026-05-23  优化: volatile修饰ISR共享变量, const正确性, vsnprintf, BYTE协议接口
 */

#ifndef SERIAL_SERIAL_H_
#define SERIAL_SERIAL_H_

#include "gpio.h"
#include "main.h"
#include "usart.h"
#include "stm32h7xx_hal.h"
#include <stdarg.h>
#include <stdio.h>

/*******************************************************************************
 * 配置选项：启用哪些串口 (默认为1，若未启用请在工程预定义中设为0)
 * 例如：SERIAL_USE_USART2=0 禁用USART2
 ******************************************************************************/
#ifndef SERIAL_USE_USART1
#define SERIAL_USE_USART1 1
#endif

#ifndef SERIAL_USE_USART2
#define SERIAL_USE_USART2 0
#endif

#ifndef SERIAL_USE_USART3
#define SERIAL_USE_USART3 0
#endif

/* 根据配置声明外部句柄 (CubeMX生成的usart.h中只有启用的句柄) */
#if SERIAL_USE_USART1
extern UART_HandleTypeDef huart1;
#endif

#if SERIAL_USE_USART2
extern UART_HandleTypeDef huart2;
#endif

#if SERIAL_USE_USART3
extern UART_HandleTypeDef huart3;
#endif

/*******************************************************************************
 * 设备类型枚举 (通用名称，用户可自定义宏别名)
 ******************************************************************************/
typedef enum {
  SERIAL_DEVICE_1 = 0, // 对应 USART1
  SERIAL_DEVICE_2,     // 对应 USART2
  SERIAL_DEVICE_3      // 对应 USART3
} DeviceType;

/*******************************************************************************
 * 操作模式枚举
 ******************************************************************************/
typedef enum {
  SERIAL_REALTIME, // 实时大数据模式 (空闲中断)
  SERIAL_PROTOCOL  // 协议处理模式 (单字节中断)
} OpMode;

/*******************************************************************************
 * 协议类型枚举 (通用名称)
 ******************************************************************************/
typedef enum {
  SERIAL_BYTE,          // 单字节协议 (标志+独立读取)
  SERIAL_PACK,          // 数据包协议 (0xFF + 4字节数据 + 0xFE)
  SERIAL_TEXT,          // 文本协议 (@TEXT\r\n)
  SERIAL_SQUARE_BRACKET // 方括号协议 ([DATA])
} ProtocolType;

/*******************************************************************************
 * 缓冲区大小配置 (可在此修改)
 ******************************************************************************/
#define SERIAL_TEXT_BUF_SIZE 100      // 文本/方括号协议缓冲区大小
#define SERIAL_REALTIME_BUF_SIZE 1024 // 实时模式缓冲区大小

/*******************************************************************************
 * 发送数据包缓冲区 (供外部使用)
 ******************************************************************************/
extern uint8_t Serial_TxPacket[4]; // 单片机发送数据包 (用户填充)
extern uint8_t Serial_RxPacket[4]; // 接收数据包缓冲区 (PACK协议使用)

/*******************************************************************************
 * 用户自定义设备别名 (根据需要定义，无需修改库)
 ******************************************************************************/
// 示例：
// #define Serial_PC     SERIAL_DEVICE_1
// #define Serial_WIFI   SERIAL_DEVICE_2
// #define Serial_BT     SERIAL_DEVICE_3
// 若未定义，则使用原始枚举名

/*******************************************************************************
 * 发送函数声明
 ******************************************************************************/
void Serial_SendByte(UART_HandleTypeDef *huart, uint8_t Byte);
void Serial_SendArray(UART_HandleTypeDef *huart, const uint8_t *Array,
                      uint16_t Length);
void Serial_SendString(UART_HandleTypeDef *huart, const char *mString);
void Serial_SendNumber(UART_HandleTypeDef *huart, uint32_t Number,
                       uint8_t Length);
void Serial_Printf(UART_HandleTypeDef *huart, const char *format, ...);
void Serial_SendPacket(UART_HandleTypeDef *huart, const uint8_t *packet,
                       uint16_t size);

/*******************************************************************************
 * 接收控制函数 - 统一接口
 ******************************************************************************/
void UART_InitReceive(DeviceType device, OpMode op_mode, ProtocolType protocol);
uint8_t UART_GetRxFlag(DeviceType device);
char *UART_GetRxData(DeviceType device);

/*******************************************************************************
 * 扩展接口 - BYTE协议专用
 ******************************************************************************/
uint8_t UART_GetRxByte(DeviceType device);

#endif /* SERIAL_SERIAL_H_ */
