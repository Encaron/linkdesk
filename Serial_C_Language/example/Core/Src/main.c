/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file           : main.c
  * @brief          : Main program body
  ******************************************************************************
  * @attention
  *
  * Copyright (c) 2025 STMicroelectronics.
  * All rights reserved.
  *
  * This software is licensed under terms that can be found in the LICENSE file
  * in the root directory of this software component.
  * If no LICENSE file comes with this software, it is provided AS-IS.
  *
  ******************************************************************************
  */
/* USER CODE END Header */
/* Includes ------------------------------------------------------------------*/
#include "main.h"
#include "adc.h"
#include "dma.h"
#include "spi.h"
#include "tim.h"
#include "usart.h"
#include "gpio.h"

/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */
#include <string.h>
#include <stdio.h>
#include "../../HardWare/OLED/OLED.h"
#include "../../HardWare/LCD169/LCD.h"
#include "../../HardWare/Serial/Serial.h"
#include "../../SerialTest/DrawTest/oled_draw_test.h"
#include "../../SerialTest/DrawTest/lcd_draw_test.h"
#include "../../SerialTest/Protocols/test_protocols.h"
#include "../../SerialTest/Display/test_display.h"
#include "../../SerialTest/Display/draw_out.h"
#include "../../SerialTest/Sensor/test_sensor.h"
#include "../../SerialTest/Waveform/test_waveform.h"

/* USER CODE END Includes */

/* Private typedef -----------------------------------------------------------*/
/* USER CODE BEGIN PTD */

/* USER CODE END PTD */

/* Private define ------------------------------------------------------------*/
/* USER CODE BEGIN PD */
/* USER CODE END PD */

/* Private macro -------------------------------------------------------------*/
/* USER CODE BEGIN PM */
/* USER CODE END PM */

/* Private variables ---------------------------------------------------------*/

/* USER CODE BEGIN PV */

/* USER CODE END PV */

/* Private function prototypes -----------------------------------------------*/
void SystemClock_Config(void);
/* USER CODE BEGIN PFP */

/* USER CODE END PFP */

/* Private user code ---------------------------------------------------------*/
/* USER CODE BEGIN 0 */

/**
  * @brief 硬件初始化（精简版）
  * @note  仅初始化 OLED + LCD + 串口接收
  *         移除：RTC, Encoder, Servo, Key, 蓝牙UI
  */
void HardWare_Init(void)
{
    /* 显示屏 */
    OLED_Init();
    LCD_Init();

    /* LCD — 跳过 DMA（DMA 可能在未完全配置时超时），直接用轮询清屏 */
    HAL_Delay(50);  // 等 LCD 控制器稳定

    /* 全屏填黑（轮询，不用 DMA） */
    LCD_Address_Set(0, 0, LCD_W - 1, LCD_H - 1);
    for (uint32_t i = 0; i < (uint32_t)LCD_W * LCD_H; i++) {
        LCD_WR_DATA(BLACK);
    }

    /* OLED 清屏 */
    OLED_Clear();
    OLED_Update();

    /* LCD 显示信息 */
    LCD_ShowString(0, 0, (uint8_t *)"Draw Test v2.5.0", WHITE, BLACK, 24, 0);
    LCD_ShowString(0, 30, (uint8_t *)"OLED 128x64 | LCD 240x280", WHITE, BLACK, 16, 0);
    LCD_ShowString(0, 50, (uint8_t *)"U1:PC 115200 U3:BT 9600", WHITE, BLACK, 16, 0);
    LCD_ShowString(0, 100, (uint8_t *)"Ready.", GREEN, BLACK, 16, 0);

    /* PF8 — LED 输出 */
    {
      GPIO_InitTypeDef g = {0};
      g.Pin = GPIO_PIN_8; g.Mode = GPIO_MODE_OUTPUT_PP;
      g.Pull = GPIO_NOPULL; g.Speed = GPIO_SPEED_FREQ_LOW;
      HAL_GPIO_Init(GPIOF, &g);
      HAL_GPIO_WritePin(GPIOF, GPIO_PIN_8, GPIO_PIN_SET);
    }

    HAL_TIM_Base_Start_IT(&htim3);
}

/* USER CODE END 0 */

/**
  * @brief  The application entry point.
  * @retval int
  */
int main(void)
{

  /* USER CODE BEGIN 1 */

  /* USER CODE END 1 */

  /* MCU Configuration--------------------------------------------------------*/

  /* Reset of all peripherals, Initializes the Flash interface and the Systick. */
  HAL_Init();

  /* USER CODE BEGIN Init */

  /* USER CODE END Init */

  /* Configure the system clock */
  SystemClock_Config();

  /* USER CODE BEGIN SysInit */

  /* USER CODE END SysInit */

  /* Initialize all configured peripherals */
  MX_GPIO_Init();
  MX_DMA_Init();
  MX_USART1_UART_Init();
  MX_ADC1_Init();
  MX_TIM3_Init();
  MX_USART3_UART_Init();
  MX_USART2_UART_Init();
  MX_SPI2_Init();
  MX_TIM11_Init();
  /* USER CODE BEGIN 2 */

  HardWare_Init();

  /* ===== 初始化绘图测试模块 ===== */
   DrawTest_Init();
   LCD_DrawTest_Init();

  /*═══ 测试模块初始化（取消注释启用）═══*/

  /*── 滑杆 PWM ─────────────────────── test_protocols.c */
  Test_Init();

  /*── OLED 虚拟屏启动画面 ──────────── test_display.c */
  Test_DisplayInit();
   // ── OLED 绘图测试（draw 指令全覆盖）─────────────── draw_out.c
  OLED_Draw_Test();

  /*── 传感面板随机种子 ─────────────── test_sensor.c */
  //Test_SensorInit();

  /*── 雷达扫描线底盘（一次性）─────── draw_out.c */
  //Test_RadarInit();

  /*── 波形模式选择（如 WAVEFORM_SIN）── test_waveform.c */
  //Test_WaveformInit(WAVEFORM_SIN);

  /* USER CODE END 2 */

  /* Infinite loop */
  /* USER CODE BEGIN WHILE */
  while (1)
  {
    /* ===== 统一 UART 分发 ===== */
    if (UART_GetRxFlag(Serial_PC)) {
        char *data = UART_GetRxData(Serial_PC);
        if (data && *data) {
            printf("[echo,%s]\r\n", data);
            /* draw → 绘图（切换 OLED/LCD 改下面注释） */
            if (strncmp(data, "draw,", 5) == 0) {
                LCD_DrawTest_ProcessCommand(data);      // ← 当前路由到 LCD
             // DrawTest_ProcessCommand(data);           // ← 切换 OLED
            }
            else Test_Handle(data);  // slider/ctrl/key → test_protocols
        }
    }

    // ── 滑杆绘图定时发送 ───────────────────────────────── test_protocols.c
    //Test_SliderLoop();

    // ── 物理按键扫描（PE1=开 PE3=关）──────────────── test_protocols.c
    //Test_KeyLoop();

    // ── 旋转扫描线（雷达风格）─────────────────────── draw_out.c
    //Test_RadarLoop();

    // ── 传感面板模拟（温湿压/状态/LED/电机/电池）── test_sensor.c
    //Test_SensorLoop();

    // ── 波形测试（9 种波形）────────────────────────── test_waveform.c
    //Test_WaveformProcess();

    // ── 50ms 周期 ──
    HAL_Delay(5);

    /* USER CODE END WHILE */

    /* USER CODE BEGIN 3 */
  }
  /* USER CODE END 3 */
}

/**
  * @brief System Clock Configuration
  * @retval None
  */
void SystemClock_Config(void)
{
  RCC_OscInitTypeDef RCC_OscInitStruct = {0};
  RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

  /** Configure the main internal regulator output voltage
  */
  __HAL_RCC_PWR_CLK_ENABLE();
  __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE1);

  /** Initializes the RCC Oscillators according to the specified parameters
  * in the RCC_OscInitTypeDef structure.
  */
  RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSE;
  RCC_OscInitStruct.HSEState = RCC_HSE_ON;
  RCC_OscInitStruct.PLL.PLLState = RCC_PLL_ON;
  RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_HSE;
  RCC_OscInitStruct.PLL.PLLM = 4;
  RCC_OscInitStruct.PLL.PLLN = 168;
  RCC_OscInitStruct.PLL.PLLP = RCC_PLLP_DIV2;
  RCC_OscInitStruct.PLL.PLLQ = 4;
  if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK)
  {
    Error_Handler();
  }

  /** Initializes the CPU, AHB and APB buses clocks
  */
  RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK|RCC_CLOCKTYPE_SYSCLK
                              |RCC_CLOCKTYPE_PCLK1|RCC_CLOCKTYPE_PCLK2;
  RCC_ClkInitStruct.SYSCLKSource = RCC_SYSCLKSOURCE_PLLCLK;
  RCC_ClkInitStruct.AHBCLKDivider = RCC_SYSCLK_DIV1;
  RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV4;
  RCC_ClkInitStruct.APB2CLKDivider = RCC_HCLK_DIV2;

  if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_5) != HAL_OK)
  {
    Error_Handler();
  }
}

/* USER CODE BEGIN 4 */

/* USER CODE END 4 */

/**
  * @brief  This function is executed in case of error occurrence.
  * @retval None
  */
void Error_Handler(void)
{
  /* USER CODE BEGIN Error_Handler_Debug */
  /* User can add his own implementation to report the HAL error return state */
  __disable_irq();
  while (1)
  {
  }
  /* USER CODE END Error_Handler_Debug */
}
#ifdef USE_FULL_ASSERT
/**
  * @brief  Reports the name of the source file and the source line number
  *         where the assert_param error has occurred.
  * @param  file: pointer to the source file name
  * @param  line: assert_param error line source number
  * @retval None
  */
void assert_failed(uint8_t *file, uint32_t line)
{
  /* USER CODE BEGIN 6 */
  /* User can add his own implementation to report the file name and line number,
     ex: printf("Wrong parameters value: file %s on line %d\r\n", file, line) */
  /* USER CODE END 6 */
}
#endif /* USE_FULL_ASSERT */
