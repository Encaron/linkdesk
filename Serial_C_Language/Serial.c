/*
 * Serial.c
 *      Author: FengYiLi
 * Description: 串口通信模块 - 结构体封装版，支持按需启用USART
 *              无兼容遗留变量，所有接收数据通过统一接口访问
 *
 * History:
 *   2026-05-23  优化: 修复volatile, vsnprintf, const正确性, BYTE协议访问接口
 */

#include "Serial.h"
#include <string.h>

/*******************************************************************************
 * 全局变量定义
 ******************************************************************************/
uint8_t Serial_TxPacket[4]; // 单片机发送数据包
uint8_t Serial_RxPacket[4]; // 接收数据包缓冲区 (PACK协议使用)

/*******************************************************************************
 * 设备结构体定义 (内部使用)
 *
 * 注意: rx_flag / rx_state / rx_index / byte_temp 在ISR上下文中被修改，
 *       在任务上下文中被读取，必须用volatile修饰以防止编译器优化导致的数据不一致。
 ******************************************************************************/
typedef struct {
  /* 接收缓冲区 (静态分配，不在ISR中修改) */
  uint8_t rx_buffer[SERIAL_TEXT_BUF_SIZE];               // 协议模式接收缓冲区

  /* ISR 与任务共享变量 (volatile 确保每次访问都从内存读取) */
  volatile uint8_t rx_flag;                              // 接收完成标志
  volatile uint8_t rx_state;                             // 状态机状态
  volatile uint8_t rx_index;                             // 当前接收位置
  volatile uint8_t byte_temp;                            // 临时接收字节

  /* 配置参数 (仅在初始化时设置，ISR中只读，无需volatile) */
  ProtocolType protocol;                                 // 当前协议
  OpMode op_mode;                                       // 操作模式
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

/**
 * @brief 通过指定串口发送一个字节
 * @param huart 指向UART_HandleTypeDef结构的指针，指定使用的串口
 * @param Byte 要发送的一个字节数据
 * @retval None
 * @example Serial_SendByte(&huart1, 'A'); // 通过USART1发送字符'A'
 */
void Serial_SendByte(UART_HandleTypeDef *huart, uint8_t Byte) {
  HAL_UART_Transmit(huart, &Byte, 1, HAL_MAX_DELAY);
}

/**
 * @brief 通过指定串口发送一个字节数组
 * @param huart 指向UART_HandleTypeDef结构的指针，指定使用的串口
 * @param Array 要发送数组的首地址
 * @param Length 要发送数组的长度
 * @retval None
 * @note 优化为单次HAL_UART_Transmit调用，避免逐字节发送的开销
 * @example
 *   uint8_t data[] = {0x42, 0x43, 0x44, 0x45};
 *   Serial_SendArray(&huart2, data, sizeof(data)); // 通过USART2发送数组
 */
void Serial_SendArray(UART_HandleTypeDef *huart, const uint8_t *Array,
                      uint16_t Length) {
  HAL_UART_Transmit(huart, (uint8_t *)Array, Length, HAL_MAX_DELAY);
}

/**
 * @brief 通过指定串口发送一个字符串
 * @param huart 指向UART_HandleTypeDef结构的指针，指定使用的串口
 * @param mString 要发送字符串的首地址
 * @retval None
 * @example Serial_SendString(&huart1, "Hello World!\r\n"); //
 * 通过USART1发送字符串
 */
void Serial_SendString(UART_HandleTypeDef *huart, const char *mString) {
  for (uint16_t i = 0; mString[i] != '\0'; i++) {
    Serial_SendByte(huart, (uint8_t)mString[i]);
  }
}

/**
 * @brief 通过指定串口发送数字（十进制形式）
 * @param huart 指向UART_HandleTypeDef结构的指针，指定使用的串口
 * @param Number 要发送的数字（0~4294967295）
 * @param Length 要显示的数字长度（1~10）
 * @retval None
 * @note 预计算除数，避免循环内重复计算次方
 * @example
 *   Serial_SendNumber(&huart1, 2025, 4); // 通过USART1发送"2025"
 *   Serial_SendNumber(&huart1, 42, 2);   // 通过USART1发送"42"
 */
void Serial_SendNumber(UART_HandleTypeDef *huart, uint32_t Number,
                       uint8_t Length) {
  /* 预计算最高位除数 (10^(Length-1)) */
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
 * @brief 重定向fputc函数，用于支持标准库printf
 * @attention 仅在 SERIAL_USE_USART1=1 时编译
 *            此函数使用USART1，如需其他串口请使用 Serial_Printf
 * @example printf("Value: %d\r\n", 123); // 通过USART1输出
 */
#if SERIAL_USE_USART1
int fputc(int ch, FILE *f) {
  HAL_UART_Transmit(&huart1, (uint8_t *)&ch, 1, HAL_MAX_DELAY);
  return ch;
}
#endif

/**
 * @brief 通过指定串口发送格式化字符串（类似printf）
 * @param huart 指向UART_HandleTypeDef结构的指针，指定使用的串口
 * @param format 格式化字符串
 * @param ... 可变参数列表
 * @retval None
 * @note 使用 vsnprintf 防止缓冲区溢出
 * @example
 *   Serial_Printf(&huart1, "Value: %d\r\n", 123); // 通过USART1发送
 *   Serial_Printf(&huart2, "Temp: %.1fC\r\n", 25.5); // 通过USART2发送
 */
void Serial_Printf(UART_HandleTypeDef *huart, const char *format, ...) {
  char String[100];
  va_list arg;
  va_start(arg, format);
  vsnprintf(String, sizeof(String), format, arg);
  va_end(arg);
  Serial_SendString(huart, String);
}

/**
 * @brief 通过指定串口发送数据包（带包头包尾）
 * @param huart 指向UART_HandleTypeDef结构的指针，指定使用的串口
 * @param packet 要发送的数据包首地址
 * @param size 数据包大小（字节数）
 * @retval None
 * @attention 数据包格式: 0xFF + 数据内容 + 0xFE
 *            注意: 数据内容中不能包含0xFF或0xFE，否则接收端无法正确解析
 * @example
 *   uint8_t data[4] = {0x01, 0x02, 0x03, 0x04};
 *   Serial_SendPacket(&huart1, data, sizeof(data));
 *   // 发送内容: 0xFF 0x01 0x02 0x03 0x04 0xFE
 */
void Serial_SendPacket(UART_HandleTypeDef *huart, const uint8_t *packet,
                       uint16_t size) {
  Serial_SendByte(huart, 0xFF);
  Serial_SendArray(huart, packet, size);
  Serial_SendByte(huart, 0xFE);
}

/*******************************************************************************
 * 内部接收处理函数 - 基于设备结构体
 ******************************************************************************/

/**
 * @brief 设备初始化
 * @param dev 设备结构体指针
 * @param protocol 协议类型
 * @param op_mode 操作模式
 * @retval None
 */
static void Serial_DeviceInit(SerialDevice_t *dev, ProtocolType protocol,
                              OpMode op_mode) {
  dev->rx_flag = 0;
  dev->rx_state = 0;
  dev->rx_index = 0;
  dev->protocol = protocol;
  dev->op_mode = op_mode;
  memset(dev->rx_buffer, 0, sizeof(dev->rx_buffer));
}

/**
 * @brief 单字节协议处理
 * @param dev 设备结构体指针
 * @param data 当前接收的字节
 * @retval None
 * @note 数据存储在 dev->byte_temp 中，通过 UART_GetRxByte() 获取
 */
static void Byte_Receive(SerialDevice_t *dev, uint8_t data) {
  dev->byte_temp = data;
  dev->rx_flag = 1;
}

/**
 * @brief 数据包协议处理 (0xFF + DATA + 0xFE)
 * @param dev 设备结构体指针
 * @param data 当前接收的字节
 * @retval None
 */
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
      dev->rx_flag = 1; // 数据包接收完成
    } else {
      dev->rx_state = 0; // 包尾错误，复位状态机
    }
  }
}

/**
 * @brief 文本协议处理 (@TEXT\r\n)
 * @param dev 设备结构体指针
 * @param data 当前接收的字节
 * @retval None
 */
static void Text_Receive(SerialDevice_t *dev, uint8_t data) {
  if (dev->rx_state == 0) {
    if (data == '@' && dev->rx_flag == 0) {
      dev->rx_state = 1;
      dev->rx_index = 0;
    }
  } else if (dev->rx_state == 1) {
    if (data == '\r') {
      dev->rx_state = 2;
    } else {
      if (dev->rx_index < SERIAL_TEXT_BUF_SIZE - 1) {
        dev->rx_buffer[dev->rx_index++] = data;
      } else {
        dev->rx_state = 0; // 缓冲区溢出，复位状态机
      }
    }
  } else if (dev->rx_state == 2) {
    if (data == '\n') {
      dev->rx_state = 0;
      dev->rx_buffer[dev->rx_index] = '\0';
      dev->rx_flag = 1;
    } else {
      dev->rx_state = 0; // 格式错误，复位状态机
    }
  }
}

/**
 * @brief 方括号协议处理 ([DATA])
 * @param dev 设备结构体指针
 * @param data 当前接收的字节
 * @retval None
 */
static void SquareBracket_Receive(SerialDevice_t *dev, uint8_t data) {
  if (dev->rx_state == 0) {
    if (data == '[' && dev->rx_flag == 0) {
      dev->rx_state = 1;
      dev->rx_index = 0;
    }
  } else if (dev->rx_state == 1) {
    if (data == ']') {
      dev->rx_state = 0;
      dev->rx_buffer[dev->rx_index] = '\0';
      dev->rx_flag = 1;
    } else {
      if (dev->rx_index < SERIAL_TEXT_BUF_SIZE - 1) {
        dev->rx_buffer[dev->rx_index++] = data;
      } else {
        dev->rx_state = 0; // 缓冲区溢出，复位状态机
      }
    }
  }
}

/*******************************************************************************
 * 统一接收控制函数实现
 ******************************************************************************/
/**
 * @brief 统一串口接收初始化
 * @param device 设备类型: SERIAL_DEVICE_1/2/3
 * @param op_mode 操作模式: SERIAL_REALTIME(大数据), SERIAL_PROTOCOL(协议)
 * @param protocol 协议类型: SERIAL_BYTE, SERIAL_PACK, SERIAL_TEXT,
 * SERIAL_SQUARE_BRACKET
 * @retval 无
 * @example
 *   UART_InitReceive(SERIAL_DEVICE_1, SERIAL_PROTOCOL, SERIAL_TEXT); //
 * 设备1文本协议 UART_InitReceive(SERIAL_DEVICE_3, SERIAL_PROTOCOL,
 * SERIAL_SQUARE_BRACKET); // 设备3方括号协议
 */
void UART_InitReceive(DeviceType device, OpMode op_mode,
                      ProtocolType protocol) {
  SerialDevice_t *dev = NULL;
  UART_HandleTypeDef *huart = NULL;

  /* 选择设备结构体和对应的 UART 句柄 */
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

  /* 初始化设备结构体 */
  Serial_DeviceInit(dev, protocol, op_mode);

  /* 如果对应的串口未启用，则不启动接收中断 */
  if (huart == NULL)
    return;

  /* 根据操作模式启动中断接收 */
  if (op_mode == SERIAL_REALTIME) {
    /* 实时模式：使用空闲中断接收大数据 */
    HAL_UARTEx_ReceiveToIdle_IT(huart, realtime_buffer,
                                SERIAL_REALTIME_BUF_SIZE);
  } else {
    /* 协议模式：单字节接收，临时存储在 dev->byte_temp */
    HAL_UART_Receive_IT(huart, (uint8_t *)&dev->byte_temp, 1);
  }
}

/**
 * @brief 统一获取接收标志位
 * @param device 设备类型: SERIAL_DEVICE_1/2/3
 * @retval 1: 有新数据, 0: 无新数据
 * @note 调用此函数后会自动清除标志位
 *       注意: 读取-清除操作非原子，极端情况下ISR可能在此期间再次置位
 *       导致丢失一次通知，下一轮轮询即可恢复，不影响数据完整性
 */
uint8_t UART_GetRxFlag(DeviceType device) {
  SerialDevice_t *dev = NULL;
  switch (device) {
  case SERIAL_DEVICE_1: dev = &dev1;    break;
  case SERIAL_DEVICE_2: dev = &dev2;    break;
  case SERIAL_DEVICE_3: dev = &dev3;    break;
  default:                              return 0;
  }
  if (dev->rx_flag) {
    dev->rx_flag = 0;
    return 1;
  }
  return 0;
}

/**
 * @brief 统一获取接收数据
 * @param device 设备类型: SERIAL_DEVICE_1/2/3
 * @retval 接收数据字符串指针 (以'\0'结尾)
 * @note 适用于 SERIAL_TEXT / SERIAL_SQUARE_BRACKET 协议
 *       对于 SERIAL_PACK 协议，数据在全局 Serial_RxPacket 中
 *       对于 SERIAL_BYTE 协议，请使用 UART_GetRxByte()
 */
char *UART_GetRxData(DeviceType device) {
  SerialDevice_t *dev = NULL;
  switch (device) {
  case SERIAL_DEVICE_1: dev = &dev1;    break;
  case SERIAL_DEVICE_2: dev = &dev2;    break;
  case SERIAL_DEVICE_3: dev = &dev3;    break;
  default:                              return NULL;
  }
  return (char *)dev->rx_buffer;
}

/**
 * @brief 获取单字节协议接收到的字节
 * @param device 设备类型: SERIAL_DEVICE_1/2/3
 * @retval 接收到的字节数据
 * @note 仅在 SERIAL_BYTE 协议下有效
 *       在 UART_GetRxFlag 返回 1 后调用，获取本次接收的单字节
 * @example
 *   if (UART_GetRxFlag(SERIAL_DEVICE_1)) {
 *     uint8_t cmd = UART_GetRxByte(SERIAL_DEVICE_1);
 *     // 处理 cmd
 *   }
 */
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
 * 宏定义：生成一个设备的完整中断处理分支 (协议模式)
 ******************************************************************************/
#define SERIAL_DEVICE_BRANCH(huart_ptr, dev_struct)                                \
  if (huart == &huart_ptr) {                                                       \
    uint8_t data = dev_struct.byte_temp;                                           \
    switch (dev_struct.protocol) {                                                 \
    case SERIAL_BYTE:          Byte_Receive(&dev_struct, data);         break;     \
    case SERIAL_PACK:          Pack_Receive(&dev_struct, data);         break;     \
    case SERIAL_TEXT:          Text_Receive(&dev_struct, data);         break;     \
    case SERIAL_SQUARE_BRACKET:SquareBracket_Receive(&dev_struct, data);break;     \
    default:                   Byte_Receive(&dev_struct, data);         break;     \
    }                                                                              \
    HAL_UART_Receive_IT(&huart_ptr, (uint8_t *)&dev_struct.byte_temp, 1);          \
  }

/*******************************************************************************
 * 中断回调函数
 ******************************************************************************/

/**
 * @brief 串口接收完成中断回调 (协议模式)
 * @param huart 串口句柄指针
 * @retval 无
 * @note 协议模式下每收到一个字节触发一次
 *       由 HAL_UART_Receive_IT 启动的接收完成后自动调用
 */
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

/**
 * @brief 空闲中断回调，用于实时大数据接收
 * @param huart 串口句柄指针
 * @param Size 接收到的数据长度
 * @retval 无
 */
void HAL_UARTEx_RxEventCallback(UART_HandleTypeDef *huart, uint16_t Size) {
#if SERIAL_USE_USART1
  if (huart == &huart1) {
    dev1.rx_flag = 1;
    /* 实时模式数据存储在 realtime_buffer 中，用户需直接访问该数组 */
    HAL_UARTEx_ReceiveToIdle_IT(&huart1, realtime_buffer, SERIAL_REALTIME_BUF_SIZE);
  }
#endif
  /* 如需其他串口的实时模式，可在此添加类似分支 */
}
