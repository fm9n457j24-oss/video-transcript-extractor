// B站文案提取路由
import { Router, type Request, type Response } from 'express'
import { extractBilibili } from '../services/bilibili.js'
import { createASRTask } from '../services/tencent-asr.js'

const router = Router()

/**
 * POST /api/bilibili - 提取B站文案
 * 1. 解析链接获取视频信息
 * 2. 有字幕: 直接返回 transcript
 * 3. 无字幕: 获取音频URL -> 创建ASR任务 -> 返回 taskId + 视频信息
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { url } = req.body || {}
    if (!url || typeof url !== 'string') {
      res.status(400).json({ success: false, error: '缺少 url 参数' })
      return
    }

    const result = await extractBilibili(url)

    // 有字幕：直接返回文案
    if (result.subtitleSource === 'subtitle' && result.transcript) {
      res.json({
        success: true,
        data: {
          ...result.videoInfo,
          subtitleSource: 'subtitle',
          transcript: result.transcript,
        },
      })
      return
    }

    // 无字幕：获取音频URL -> 创建 ASR 任务
    if (!result.audioUrl) {
      res
        .status(500)
        .json({ success: false, error: '无法获取音频流，请稍后重试' })
      return
    }

    const taskId = await createASRTask(result.audioUrl)
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
