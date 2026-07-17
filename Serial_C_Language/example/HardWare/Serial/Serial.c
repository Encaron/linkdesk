/*
 * Serial.c
 *      Author: FengYiLi
 * Description: 串口通信模块 - 结构体封装版，支持按需启用USART
 *              无兼容遗留变量，所有接收数据通过统一接口访问
 *
 * History:
 *   2026-05-23  优化: 修复volatile, vsnprintf, const正确性, BYTE协议访问接口
 *   2026-06-20  移植到 STM32F407: 改 HAL 头为 stm32f4xx
 *               启用 USART1+USART3，默认方括号协议
 */

#include "Serial.h"
#include <string.h>

/*******************************************************************************
 * 全局变量定义
 ******************************************************************************/
uint8_t Serial_TxPacket[4]; // 发送数据包
uint8_t Serial_RxPacket[4]; // 接收数据包缓冲区 (PACK协议使用)

/*******************************************************************************
 * 设备结构体定义 (内部使用)
 *
 * 注意: rx_flag / rx_state / rx_index / byte_temp 在ISR上下文中被修改，
 *       在任务上下文中被读取，必须用volatile修饰以防止编译器优化导致的数据不一致。
 ******************************************************************************/
typedef struct {
  /* 双槽接收队列：ISR 写一槽，主循环读另一槽，最多缓冲 2 帧 */
  uint8_t rx_buf[2][SERIAL_TEXT_BUF_SIZE];     // [0]和[1]两个槽
  volatile uint8_t rx_wr;                      // ISR 当前写入的槽号 (0/1)
  volatile uint8_t rx_rd;                      // 主循环下次读取的槽号 (0/1)
  volatile uint8_t rx_count;                   // 待读取帧数 (0~2)

  /* ISR 状态 */
  volatile uint8_t rx_state;                   // 状态机
  volatile uint8_t rx_index;                   // 当前接收位置
  volatile uint8_t byte_temp;                  // 临时接收字节

  ProtocolType protocol;
  OpMode op_mode;
} SerialDevice_t;

/* 三个设备实例 (静态分配，零malloc) */
static SerialDevice_t dev1; // 对应 SERIAL_DEVICE_1 (USART1)
static SerialDevice_t dev2; // 对应 SERIAL_DEVICE_2 (USART2)
static SerialDevice_t dev3; // 对应 SERIAL_DEVICE_3 (USART3)

/* 实时模式专用缓冲区 (全局共享) */
static uint8_t realtime_buffer[SERIAL_REALTIME_BUF_SIZE];

/*******************************************************************************
 * 内部函数声明
 ******************************************************************************/
static void Serial_DeviceInit(SerialDevice_t *dev, ProtocolType protocol,
                              OpMode op_mode);
static void Byte_Receive(SerialDevice_t *dev, uint8_t data);
static void Pack_Receive(SerialDevice_t *dev, uint8_t data);
static void Text_Receive(SerialDevice_t *dev, uint8_t data);
static void SquareBracket_Receive(SerialDevice_t *dev, uint8_t data);

/*******************************************************************************
 * 发送函数
 ******************************************************************************/

void Serial_SendByte(UART_HandleTypeDef *huart, uint8_t Byte) {
  HAL_UART_Transmit(huart, &Byte, 1, HAL_MAX_DELAY);
}

void Serial_SendArray(UART_HandleTypeDef *huart, const uint8_t *Array,
                      uint16_t Length) {
  HAL_UART_Transmit(huart, (uint8_t *)Array, Length, HAL_MAX_DELAY);
}

void Serial_SendString(UART_HandleTypeDef *huart, const char *mString) {
  for (uint16_t i = 0; mString[i] != '\0'; i++) {
    Serial_SendByte(huart, (uint8_t)mString[i]);
  }
}

void Serial_SendNumber(UART_HandleTypeDef *huart, uint32_t Number,
                       uint8_t Length) {
  uint32_t divisor = 1;
  for (uint8_t i = 1; i < Length; i++) {
    divisor *= 10;
  }
  for (uint8_t i = 0; i < Length; i++) {
    Serial_SendByte(huart, (Number / divisor) % 10 + '0');
    divisor /= 10;
  }
}

/**
 * @brief 重定向fputc，使标准库 printf 通过 USART1 输出
 */
#if SERIAL_USE_USART1
int fputc(int ch, FILE *f) {
  HAL_UART_Transmit(&huart1, (uint8_t *)&ch, 1, HAL_MAX_DELAY);
  return ch;
}
#endif

void Serial_Printf(UART_HandleTypeDef *huart, const char *format, ...) {
  char String[100];
  va_list arg;
  va_start(arg, format);
  vsnprintf(String, sizeof(String), format, arg);
  va_end(arg);
  Serial_SendString(huart, String);
}

void Serial_SendPacket(UART_HandleTypeDef *huart, const uint8_t *packet,
                       uint16_t size) {
  Serial_SendByte(huart, 0xFF);
  Serial_SendArray(huart, packet, size);
  Serial_SendByte(huart, 0xFE);
}

/*******************************************************************************
 * 内部接收处理函数 - 基于设备结构体
 ******************************************************************************/

static void Serial_DeviceInit(SerialDevice_t *dev, ProtocolType protocol,
                              OpMode op_mode) {
  dev->rx_count = 0;
  dev->rx_wr    = 0;
  dev->rx_rd    = 0;
  dev->rx_state = 0;
  dev->rx_index = 0;
  dev->protocol = protocol;
  dev->op_mode = op_mode;
  memset(dev->rx_buf[0], 0, sizeof(dev->rx_buf[0]));
  memset(dev->rx_buf[1], 0, sizeof(dev->rx_buf[1]));
}

static void Byte_Receive(SerialDevice_t *dev, uint8_t data) {
  dev->byte_temp = data;
  dev->rx_count = 1;
}

static void Pack_Receive(SerialDevice_t *dev, uint8_t data) {
  if (dev->rx_state == 0) {
    if (data == 0xFF) {
      dev->rx_state = 1;
      dev->rx_index = 0;
    }
  } else if (dev->rx_state == 1) {
    if (dev->rx_index < sizeof(Serial_RxPacket)) {
      Serial_RxPacket[dev->rx_index++] = data;
    }
    if (dev->rx_index >= sizeof(Serial_RxPacket)) {
      dev->rx_state = 2;
    }
  } else if (dev->rx_state == 2) {
    if (data == 0xFE) {
      dev->rx_state = 0;
      dev->rx_count = 1;
    } else {
      dev->rx_state = 0;
    }
  }
}

static void Text_Receive(SerialDevice_t *dev, uint8_t data) {
  if (dev->rx_state == 0) {
    if (data == '@' ) {
      dev->rx_state = 1;
      dev->rx_index = 0;
    }
  } else if (dev->rx_state == 1) {
    if (data == '\r') {
      dev->rx_state = 2;
    } else {
      if (dev->rx_index < SERIAL_TEXT_BUF_SIZE - 1) {
        dev->rx_buf[dev->rx_wr][dev->rx_index++] = data;
      } else {
        dev->rx_state = 0;
      }
    }
  } else if (dev->rx_state == 2) {
    if (data == '\n') {
      dev->rx_state = 0;
      dev->rx_buf[dev->rx_wr][dev->rx_index] = '\0';
      if (dev->rx_count < 2) dev->rx_count++;
      dev->rx_wr ^= 1;
    } else {
      dev->rx_state = 0;
    }
  }
}

static void SquareBracket_Receive(SerialDevice_t *dev, uint8_t data) {
  if (dev->rx_state == 0) {
    if (data == '[') {
      /* 队列满 → 拒收新帧，防止覆盖未读数据（D38: 双缓冲溢出踩踏） */
      if (dev->rx_count >= 2) return;
      dev->rx_state = 1;
      dev->rx_index = 0;
    }
  } else if (dev->rx_state == 1) {
    if (data == ']') {
      dev->rx_state = 0;
      dev->rx_buf[dev->rx_wr][dev->rx_index] = '\0';
      /* 入队：计数器 +1，写指针翻转 */
      if (dev->rx_count < 2) dev->rx_count++;
      dev->rx_wr ^= 1;
    } else {
      if (dev->rx_index < SERIAL_TEXT_BUF_SIZE - 1) {
        dev->rx_buf[dev->rx_wr][dev->rx_index++] = data;
      } else {
        dev->rx_state = 0;
      }
    }
  }
}

/*******************************************************************************
 * 统一接收控制函数
 ******************************************************************************/

void UART_InitReceive(DeviceType device, OpMode op_mode,
                      ProtocolType protocol) {
  SerialDevice_t *dev = NULL;
  UART_HandleTypeDef *huart = NULL;

  switch (device) {
  case SERIAL_DEVICE_1:
    dev = &dev1;
#if SERIAL_USE_USART1
    huart = &huart1;
#endif
    break;
  case SERIAL_DEVICE_2:
    dev = &dev2;
#if SERIAL_USE_USART2
    huart = &huart2;
#endif
    break;
  case SERIAL_DEVICE_3:
    dev = &dev3;
#if SERIAL_USE_USART3
    huart = &huart3;
#endif
    break;
  default:
    return;
  }

  if (dev == NULL)
    return;

  Serial_DeviceInit(dev, protocol, op_mode);

  if (huart == NULL)
    return;

  if (op_mode == SERIAL_REALTIME) {
    HAL_UARTEx_ReceiveToIdle_IT(huart, realtime_buffer,
                                SERIAL_REALTIME_BUF_SIZE);
  } else {
    HAL_UART_Receive_IT(huart, (uint8_t *)&dev->byte_temp, 1);
  }
}

uint8_t UART_GetRxFlag(DeviceType device) {
  SerialDevice_t *dev = NULL;
  switch (device) {
  case SERIAL_DEVICE_1: dev = &dev1;    break;
  case SERIAL_DEVICE_2: dev = &dev2;    break;
  case SERIAL_DEVICE_3: dev = &dev3;    break;
  default:                              return 0;
  }
  if (dev->rx_count > 0) {
    return 1;
  }
  return 0;
}

char *UART_GetRxData(DeviceType device) {
  SerialDevice_t *dev = NULL;
  switch (device) {
  case SERIAL_DEVICE_1: dev = &dev1;    break;
  case SERIAL_DEVICE_2: dev = &dev2;    break;
  case SERIAL_DEVICE_3: dev = &dev3;    break;
  default:                              return NULL;
  }
  if (dev->rx_count == 0) return NULL;
  /* 出队：返回当前读槽数据，然后翻转读指针 */
  char *data = (char *)dev->rx_buf[dev->rx_rd];
  dev->rx_count--;
  dev->rx_rd ^= 1;
  return data;
}

uint8_t UART_GetRxByte(DeviceType device) {
  SerialDevice_t *dev = NULL;
  switch (device) {
  case SERIAL_DEVICE_1: dev = &dev1;    break;
  case SERIAL_DEVICE_2: dev = &dev2;    break;
  case SERIAL_DEVICE_3: dev = &dev3;    break;
  default:                              return 0;
  }
  return dev->byte_temp;
}

/*******************************************************************************
 * 宏：生成一个设备的完整中断处理分支 (协议模式)
 ******************************************************************************/
#define SERIAL_DEVICE_BRANCH(huart_ptr, dev_struct)                           \
  if (huart == &huart_ptr) {                                                  \
    uint8_t data = dev_struct.byte_temp;                                      \
    switch (dev_struct.protocol) {                                            \
    case SERIAL_BYTE:          Byte_Receive(&dev_struct, data);    break;     \
    case SERIAL_PACK:          Pack_Receive(&dev_struct, data);    break;     \
    case SERIAL_TEXT:          Text_Receive(&dev_struct, data);    break;     \
    case SERIAL_SQUARE_BRACKET:SquareBracket_Receive(&dev_struct,data);break; \
    default:                   Byte_Receive(&dev_struct, data);    break;     \
    }                                                                         \
    HAL_UART_Receive_IT(&huart_ptr, (uint8_t *)&dev_struct.byte_temp, 1);     \
  }

/*******************************************************************************
 * 中断回调函数
 ******************************************************************************/

void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart) {
#if SERIAL_USE_USART1
  SERIAL_DEVICE_BRANCH(huart1, dev1)
#endif

#if SERIAL_USE_USART2
  SERIAL_DEVICE_BRANCH(huart2, dev2)
#endif

#if SERIAL_USE_USART3
  SERIAL_DEVICE_BRANCH(huart3, dev3)
#endif
}

void HAL_UARTEx_RxEventCallback(UART_HandleTypeDef *huart, uint16_t Size) {
#if SERIAL_USE_USART1
  if (huart == &huart1) {
    dev1.rx_count = 1;
    HAL_UARTEx_ReceiveToIdle_IT(&huart1, realtime_buffer,
                                SERIAL_REALTIME_BUF_SIZE);
  }
#endif
}
