// 抖音文案提取路由
import { Router, type Request, type Response } from 'express'
import { extractDouyin } from '../services/douyin.js'
import { createASRTask } from '../services/tencent-asr.js'

const router = Router()

/**
 * POST /api/douyin - 提取抖音文案
 * 1. 解析链接获取视频信息和视频URL
 * 2. 创建ASR任务 -> 返回 taskId + 视频信息
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { url } = req.body || {}
    if (!url || typeof url !== 'string') {
      res.status(400).json({ success: false, error: '缺少 url 参数' })
      return
    }

    const result = await extractDouyin(url)

    if (!result.videoUrl) {
      res
        .status(500)
        .json({ success: false, error: '无法获取视频地址，请稍后重试' })
      return
    }

    const taskId = await createASRTask(result.videoUrl)
    res.json({
      success: true,
      taskId,
      data: {
        ...result.videoInfo,
        subtitleSource: 'asr',
        transcript: [],
      },
    })
  } catch (err: any) {
    res
      .status(500)
      .json({ success: false, error: err?.message || '提取失败' })
  }
})

export default router
