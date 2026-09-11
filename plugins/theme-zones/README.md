# 分区纹理示例主题

「不同区域可以有不同背景」这件事的两个样板——**纯数据插件**。

## 这是什么

普通主题给整扇窗一个底色。这套演示的是**分区域**的两条路：

| 主题 | 系统类型 | 做法 |
|:--|:--|:--|
| **纸纹分区 Paper Zones** | 亮色 | 给某个面贴一张**平铺纹理**（`surface.texture`）——纸纹自己重复铺满 |
| **影像分区 Image Zones** | 暗色 | 给某个面贴一张**连续切片**（`background.mode: zones`）——图按区域裁开，各拿各的一块 |

- 插件 ID：`theme-zones`
- 色板：纸纹区 · 影像区
- 怎么换：设置 → 外观 → 主题

> 它存在的意义：**分区域背景是一套壳机制，不是一个特例**——这只插件是它的第一个真实消费者。

## 结构

```
plugin.json               声明（contributes.themes——两项）
paper-zones.json          纸纹分区（平铺纹理）
image-zones.json          影像分区（连续切片）
resources/paper-texture.svg   平铺用的纸纹
resources/zones-bg.svg        切片用的底图
resources/icon.svg            身份图
```
