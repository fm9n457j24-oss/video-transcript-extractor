// ASR结果轮询路由
import { Router, type Request, type Response } from 'express'
import { pollASRTask } from '../services/tencent-asr.js'

const router = Router()

/**
 * GET /api/asr/poll?taskId=xxx - 轮询ASR结果
 */
router.get('/poll', async (req: Request, res: Response): Promise<void> => {
  try {
    const taskIdParam = req.query.taskId
    if (!taskIdParam) {
      res
        .status(400)
        .json({ success: false, status: 'failed', error: '缺少 taskId 参数' })
      return
    }

    const taskId = Number(taskIdParam)
    if (!Number.isFinite(taskId)) {
      res
        .status(400)
        .json({ success: false, status: 'failed', error: 'taskId 参数无效' })
      return
    }

    const result = await pollASRTask(taskId)

    if (result.status === 'success') {
      res.json({
        success: true,
        status: 'success',
        data: { transcript: result.transcript || [] },
      })
    } else if (result.status === 'failed') {
      res.json({
        success: false,
        status: 'failed',
        error: result.error || '识别失败',
      })
    } else {
      res.json({ success: true, status: 'processing' })
    }
  } catch (err: any) {
    res.json({
      success: false,
      status: 'failed',
      error: err?.message || '轮询失败',
    })
  }
})

export default router
