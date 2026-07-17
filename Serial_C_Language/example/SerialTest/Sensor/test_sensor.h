/*
 * test_sensor.h
 *
 * 传感面板模拟 —— 7 种传感器卡片随机数据发生器
 * 调用 Test_SensorInit() 一次，然后每 50ms 调用 Test_SensorLoop()
 */
#ifndef TEST_SENSOR_H_
#define TEST_SENSOR_H_

extern float sensor_batt;  // 电池电压，可由 [ctrl,slider,...] 控制
void Test_SensorInit(void);
void Test_SensorLoop(void);

#endif /* TEST_SENSOR_H_ */
