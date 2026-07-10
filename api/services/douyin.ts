// 抖音服务 - 仅使用 fetch API，不依赖 Node.js 专有模块
import fs from 'fs'
import path from 'path'
import os from 'os'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import type { VideoInfo } from '../../shared/types.js'

const DOUYIN_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
const DOUYIN_REFERER = 'https://www.douyin.com/'

// 临时视频文件目录
const VIDEO_TEMP_DIR = path.join(os.tmpdir(), 'douyin-video-temp')
try {
  if (!fs.existsSync(VIDEO_TEMP_DIR)) {
    fs.mkdirSync(VIDEO_TEMP_DIR, { recursive: true })
  }
} catch {}

/**
 * 下载抖音视频到临时文件（流式写入，避免大文件OOM）
 * 抖音CDN需要特定请求头，否则可能被拒绝
 */
export async function downloadVideoFile(
  videoUrl: string,
): Promise<{ filePath: string; size: number }> {
  const resp = await fetch(videoUrl, {
    headers: {
      'User-Agent': DOUYIN_UA,
      Referer: DOUYIN_REFERER,
    },
  })
  if (!resp.ok || !resp.body) {
    throw new Error(`下载抖音视频失败: HTTP ${resp.status}`)
  }
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const filePath = path.join(VIDEO_TEMP_DIR, `${id}.mp4`)
  const fileStream = fs.createWriteStream(filePath)
  await pipeline(Readable.fromWeb(resp.body as any), fileStream)
  const size = fs.statSync(filePath).size
  return { filePath, size }
}

/**
 * 清理临时视频文件
 */
export function cleanupVideoFile(
  filePath: string,
  delayMs = 30 * 60 * 1000,
): void {
  setTimeout(() => {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    } catch {}
  }, delayMs)
}

/**
 * 从分享文本中提取 URL
 */
function extractUrlFromText(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s，,。]+/)
  return match ? match[0] : null
}

/**
 * 解析短链获取真实URL
 * 抖音分享文本如 "xxx https://v.douyin.com/xxxx/ xxx"，先提取URL
 * fetch 短链URL，跟随重定向获取真实视频页面URL
 */
export async function resolveDouyinUrl(url: string): Promise<string> {
  const rawUrl = extractUrlFromText(url) || url
  const resp = await fetch(rawUrl, {
    method: 'GET',
    redirect: 'follow',
    headers: { 'User-Agent': DOUYIN_UA },
  })
  const finalUrl = resp.url || rawUrl
  return finalUrl
}

/**
 * 从指定起始位置提取一个完整的 JSON 对象字符串（通过花括号匹配）
 */
function extractJsonObject(text: string, startIndex: number): string | null {
  if (text[startIndex] !== '{') return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i]
    if (escape) {
      escape = false
      continue
    }
    if (ch === '\\') {
      escape = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(startIndex, i + 1)
    }
  }
  return null
}

/**
 * 从 HTML 中解析 _ROUTER_DATA
 */
function parseRouterData(html: string): any | null {
  const marker = 'window._ROUTER_DATA'
  const idx = html.indexOf(marker)
  if (idx === -1) return null

  // 找到 '=' 之后第一个 '{'
  const eqIdx = html.indexOf('=', idx)
  if (eqIdx === -1) return null
  let braceIdx = html.indexOf('{', eqIdx)
  if (braceIdx === -1) return null

  // 处理 JSON.parse("...") 包裹的情况
  const parseCall = html.slice(eqIdx + 1, braceIdx)
  if (parseCall.includes('JSON.parse')) {
    const quoteStart = html.indexOf('"', eqIdx)
    if (quoteStart !== -1) {
      const quoteEnd = html.indexOf('")', quoteStart)
      if (quoteEnd !== -1) {
        const escaped = html.slice(quoteStart + 1, quoteEnd)
        try {
          return JSON.parse(JSON.parse('"' + escaped + '"'))
        } catch {
          // fallthrough
        }
      }
    }
  }

  const jsonStr = extractJsonObject(html, braceIdx)
  if (!jsonStr) return null
  try {
    return JSON.parse(jsonStr)
  } catch {
    return null
  }
}

/**
 * 递归查找满足条件的对象
 */
function deepFind(obj: any, predicate: (o: any) => boolean): any | null {
  if (!obj || typeof obj !== 'object') return null
  if (predicate(obj)) return obj
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = deepFind(item, predicate)
      if (found) return found
    }
  } else {
    for (const key of Object.keys(obj)) {
      const found = deepFind(obj[key], predicate)
      if (found) return found
    }
  }
  return null
}

/**
 * 获取抖音视频信息
 * 从HTML中解析 video 对象（通常在 window._ROUTER_DATA 或 renderData 中）
 */
export async function getDouyinVideoInfo(videoUrl: string): Promise<{
  title: string
  cover: string
  author: string
  duration: number
  videoUrl: string
}> {
  const resp = await fetch(videoUrl, {
    headers: {
      'User-Agent': DOUYIN_UA,
      Referer: DOUYIN_REFERER,
    },
  })
  const html = await resp.text()

  let videoObj: any = null

  const routerData = parseRouterData(html)
  if (routerData) {
    // 在 loaderData 中查找包含视频信息的对象
    const candidate = deepFind(
      routerData,
      (o) =>
        o &&
        typeof o === 'object' &&
        (o.videoInfoRes || o.aweme_detail || o.video || o.desc !== undefined),
    )
    if (candidate) {
      videoObj = candidate.videoInfoRes || candidate.aweme_detail || candidate
    }
  }

  // 从 videoObj 中提取各字段
  const item = videoObj?.item || videoObj?.awemeDetail || videoObj
  const video = item?.video || videoObj?.video
  const author = item?.author || videoObj?.author

  const title: string =
    item?.desc || videoObj?.desc || item?.preview_title || ''
  const cover: string =
    video?.cover?.url_list?.[0] ||
    video?.cover?.url_list?.[0] ||
    item?.video?.cover?.url_list?.[0] ||
    ''
  const authorName: string = author?.nickname || author?.name || ''
  const duration: number = Math.floor(
    (video?.duration || item?.duration || 0) / 1000,
  )

  // 无水印视频URL：play_addr 中的 url_list，去掉 playwm 标记
  let noWatermarkUrl: string = ''
  const playAddr =
    video?.play_addr || item?.video?.play_addr || videoObj?.play_addr
  if (playAddr?.url_list?.length) {
    noWatermarkUrl = playAddr.url_list[0]
    // 替换 playwm 为 play 获取无水印地址
    noWatermarkUrl = noWatermarkUrl.replace('playwm', 'play')
  }

  if (!title && !noWatermarkUrl) {
    throw new Error('解析抖音视频信息失败，可能存在反爬限制')
  }

  return {
    title,
    cover,
    author: authorName,
    duration,
    videoUrl: noWatermarkUrl,
  }
}

/**
 * 整合抖音文案提取流程
 */
export async function extractDouyin(url: string): Promise<{
  videoInfo: VideoInfo
  videoUrl: string
}> {
  const realUrl = await resolveDouyinUrl(url)
  const info = await getDouyinVideoInfo(realUrl)

  const videoInfo: VideoInfo = {
    title: info.title,
    cover: info.cover,
    author: info.author,
    duration: info.duration,
    platform: 'douyin',
  }

  return {
    videoInfo,
    videoUrl: info.videoUrl,
  }
}
