// 抖音文案提取路由
import { Router, type Request, type Response } from 'express'
import fs from 'fs'
import path from 'path'
import {
  extractDouyin,
  downloadVideoFile,
  cleanupVideoFile,
} from '../services/douyin.js'
import { createASRTask } from '../services/tencent-asr.js'

const router = Router()

const MAX_DATA_SIZE = 3 * 1024 * 1024 // 3MB - 控制base64内存占用

/**
 * POST /api/douyin - 提取抖音文案
 * 1. 解析链接获取视频信息和视频URL
 * 2. 下载视频 -> 创建ASR任务 -> 返回 taskId + 视频信息
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

    // 抖音CDN需要特定请求头，不能直接让腾讯云下载
    const { filePath, size } = await downloadVideoFile(result.videoUrl)

    let taskId: string
    try {
      if (size <= MAX_DATA_SIZE) {
        // 小文件：base64编码后直接传给腾讯云（Data模式）
        const videoBase64 = fs.readFileSync(filePath).toString('base64')
        taskId = await createASRTask({
          data: videoBase64,
          dataLen: videoBase64.length,
        })
        cleanupVideoFile(filePath, 0)
      } else {
        // 大文件：通过临时URL让腾讯云下载（URL模式）
        const host =
          req.get('x-forwarded-host') || req.get('host') || ''
        const proto =
          req.get('x-forwarded-proto') || req.protocol || 'https'
        const publicUrl = `${proto}://${host}/video/temp/${path.basename(filePath)}`
        taskId = await createASRTask({ url: publicUrl })
        cleanupVideoFile(filePath, 30 * 60 * 1000)
      }
    } catch (err) {
      cleanupVideoFile(filePath, 0)
      throw err
    }

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
