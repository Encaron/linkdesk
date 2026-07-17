/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file           : main.h
  * @brief          : Header for main.c file.
  *                   This file contains the common defines of the application.
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

/* Define to prevent recursive inclusion -------------------------------------*/
#ifndef __MAIN_H
#define __MAIN_H

#ifdef __cplusplus
extern "C" {
#endif

/* Includes ------------------------------------------------------------------*/
#include "stm32f4xx_hal.h"

/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */

/* USER CODE END Includes */

/* Exported types ------------------------------------------------------------*/
/* USER CODE BEGIN ET */

/* USER CODE END ET */

/* Exported constants --------------------------------------------------------*/
/* USER CODE BEGIN EC */

/* USER CODE END EC */

/* Exported macro ------------------------------------------------------------*/
/* USER CODE BEGIN EM */

/* USER CODE END EM */

/* Exported functions prototypes ---------------------------------------------*/
void Error_Handler(void);

/* USER CODE BEGIN EFP */

/* USER CODE END EFP */

/* Private defines -----------------------------------------------------------*/
#define KEY2_Pin GPIO_PIN_2
#define KEY2_GPIO_Port GPIOE
#define KEY3_Pin GPIO_PIN_3
#define KEY3_GPIO_Port GPIOE
#define KEY4_Pin GPIO_PIN_4
#define KEY4_GPIO_Port GPIOE
#define LCD_RES_Pin GPIO_PIN_5
#define LCD_RES_GPIO_Port GPIOE
#define LCD_DC_Pin GPIO_PIN_6
#define LCD_DC_GPIO_Port GPIOE
#define LED_1_Pin GPIO_PIN_13
#define LED_1_GPIO_Port GPIOC
#define EXIT_F4_Pin GPIO_PIN_4
#define EXIT_F4_GPIO_Port GPIOF
#define EXIT_F4_EXTI_IRQn EXTI4_IRQn
#define Encoder_Key_Pin GPIO_PIN_5
#define Encoder_Key_GPIO_Port GPIOF
#define EXIT_F6_Pin GPIO_PIN_6
#define EXIT_F6_GPIO_Port GPIOF
#define EXIT_F6_EXTI_IRQn EXTI9_5_IRQn
#define LED1_Pin GPIO_PIN_7
#define LED1_GPIO_Port GPIOF
#define LED2_Pin GPIO_PIN_8
#define LED2_GPIO_Port GPIOF
#define LED3_Pin GPIO_PIN_9
#define LED3_GPIO_Port GPIOF
#define LED4_Pin GPIO_PIN_10
#define LED4_GPIO_Port GPIOF
#define Beep_Pin GPIO_PIN_1
#define Beep_GPIO_Port GPIOA
#define LCD_CS_Pin GPIO_PIN_7
#define LCD_CS_GPIO_Port GPIOE
#define LCD_BLK_Pin GPIO_PIN_12
#define LCD_BLK_GPIO_Port GPIOD
#define OLED_SDA_Pin GPIO_PIN_9
#define OLED_SDA_GPIO_Port GPIOC
#define OLED_CLK_Pin GPIO_PIN_8
#define OLED_CLK_GPIO_Port GPIOA
#define Key_1_1_Pin GPIO_PIN_15
#define Key_1_1_GPIO_Port GPIOA
#define KEY1_Pin GPIO_PIN_1
#define KEY1_GPIO_Port GPIOE

/* USER CODE BEGIN Private defines */

/* USER CODE END Private defines */

#ifdef __cplusplus
}
#endif

#endif /* __MAIN_H */
