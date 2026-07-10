// B站文案提取路由
import { Router, type Request, type Response } from 'express'
import fs from 'fs'
import path from 'path'
import {
  extractBilibili,
  downloadAudioFile,
  cleanupAudioFile,
} from '../services/bilibili.js'
import { createASRTask } from '../services/tencent-asr.js'

const router = Router()

const MAX_DATA_SIZE = 5 * 1024 * 1024 // 5MB - 腾讯云ASR Data模式限制

/**
 * POST /api/bilibili - 提取B站文案
 * 1. 解析链接获取视频信息
 * 2. 有字幕: 直接返回 transcript
 * 3. 无字幕: 下载音频 -> 创建ASR任务 -> 返回 taskId + 视频信息
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

    // 无字幕：下载音频 -> 创建 ASR 任务
    if (!result.audioUrl) {
      res
        .status(500)
        .json({ success: false, error: '无法获取音频流，请稍后重试' })
      return
    }

    // B站CDN需要Referer头，不能直接让腾讯云下载
    const { filePath, size } = await downloadAudioFile(result.audioUrl)

    let taskId: string
    try {
      if (size <= MAX_DATA_SIZE) {
        // 小文件：base64编码后直接传给腾讯云（Data模式）
        const audioBase64 = fs.readFileSync(filePath).toString('base64')
        taskId = await createASRTask({
          data: audioBase64,
          dataLen: audioBase64.length,
        })
        // Data模式不需要保留文件，立即清理
        cleanupAudioFile(filePath, 0)
      } else {
        // 大文件：通过临时URL让腾讯云下载（URL模式）
        const host =
          req.get('x-forwarded-host') || req.get('host') || ''
        const proto =
          req.get('x-forwarded-proto') || req.protocol || 'https'
        const publicUrl = `${proto}://${host}/audio/temp/${path.basename(filePath)}`
        taskId = await createASRTask({ url: publicUrl })
        // 延迟清理，给腾讯云足够时间下载
        cleanupAudioFile(filePath, 30 * 60 * 1000)
      }
    } catch (err) {
      cleanupAudioFile(filePath, 0)
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
