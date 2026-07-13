// 抖音服务 - 使用 iesdouyin.com 分享页（无需签名/Cookie，绕过反爬）
// 方案来源：github.com/wujunwei928/parse-video
import fs from 'fs'
import path from 'path'
import os from 'os'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import type { VideoInfo } from '../../shared/types.js'

// 移动端 UA 是关键：iesdouyin.com 分享页只对移动端开放预览
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'

// 临时视频文件目录
const VIDEO_TEMP_DIR = path.join(os.tmpdir(), 'douyin-video-temp')
try {
  if (!fs.existsSync(VIDEO_TEMP_DIR)) {
    fs.mkdirSync(VIDEO_TEMP_DIR, { recursive: true })
  }
} catch {}

/**
 * 下载抖音视频到临时文件（流式写入，避免大文件OOM）
 */
export async function downloadVideoFile(
  videoUrl: string,
): Promise<{ filePath: string; size: number }> {
  const resp = await fetch(videoUrl, {
    headers: {
      'User-Agent': MOBILE_UA,
      Referer: 'https://www.iesdouyin.com/',
    },
  })
  if (!resp.ok || !resp.body) {
    throw new Error(`下载抖音视频失败: HTTP ${resp.status}`)
  }
  const contentType = resp.headers.get('content-type') || ''
  if (contentType.includes('text/html')) {
    throw new Error('抖音视频URL返回了HTML页面（可能被防盗链拦截）')
  }
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const filePath = path.join(VIDEO_TEMP_DIR, `${id}.mp4`)
  const fileStream = fs.createWriteStream(filePath)
  await pipeline(Readable.fromWeb(resp.body as any), fileStream)
  const size = fs.statSync(filePath).size
  if (size < 1024) {
    const content = fs.readFileSync(filePath, 'utf8').substring(0, 200)
    fs.unlinkSync(filePath)
    throw new Error(`下载的视频文件过小（${size}字节），内容: ${content}`)
  }
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
 * 解析短链，从 302 重定向 Location 中提取视频ID
 * 抖音短链格式: https://v.douyin.com/xxxxxx/
 * 重定向到: https://www.iesdouyin.com/share/video/{videoId}/...
 */
export async function resolveDouyinUrl(
  url: string,
): Promise<{ videoId: string; finalUrl: string }> {
  const rawUrl = extractUrlFromText(url) || url

  // 尝试从 URL 中直接提取 videoId
  let videoId = extractVideoId(rawUrl)

  if (!videoId) {
    // 短链：禁用重定向，从 302 Location 提取 videoId
    const resp = await fetch(rawUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': MOBILE_UA },
    })
    // 302/301 的 Location 头
    const location =
      resp.headers.get('location') || resp.headers.get('Location') || ''
    if (location) {
      videoId = extractVideoId(location)
    }
    // 如果还没拿到，跟随重定向再试
    if (!videoId && (resp.status === 301 || resp.status === 302) && location) {
      const resp2 = await fetch(location, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'User-Agent': MOBILE_UA },
      })
      videoId = extractVideoId(resp2.url)
    }
  }

  if (!videoId) {
    throw new Error('无法从抖音链接中提取视频ID')
  }

  return { videoId, finalUrl: rawUrl }
}

/**
 * 从 URL 中提取视频ID
 * 支持格式:
 *   /video/{id}
 *   /share/video/{id}
 *   modal_id={id}
 *   /note/{id}
 */
function extractVideoId(url: string): string | null {
  let match = url.match(/\/video\/(\d+)/)
  if (match) return match[1]
  match = url.match(/modal_id=(\d+)/)
  if (match) return match[1]
  match = url.match(/\/note\/(\d+)/)
  if (match) return match[1]
  return null
}

/**
 * 从 HTML 中提取 window._ROUTER_DATA 的 JSON 内容
 * iesdouyin.com 分享页把视频信息嵌入在这个变量里
 */
function extractRouterDataJson(html: string): any | null {
  // 匹配 window._ROUTER_DATA = {...}</script>
  // 注意：JSON 可能很大，用非贪婪 + 花括号匹配更可靠
  const marker = 'window._ROUTER_DATA'
  const idx = html.indexOf(marker)
  if (idx === -1) return null

  // 找到 '=' 之后第一个 '{'
  const eqIdx = html.indexOf('=', idx)
  if (eqIdx === -1) return null
  const braceIdx = html.indexOf('{', eqIdx)
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

  // 直接花括号匹配提取 JSON
  const jsonStr = extractJsonObject(html, braceIdx)
  if (!jsonStr) return null
  try {
    return JSON.parse(jsonStr)
  } catch {
    return null
  }
}

/**
 * 从指定起始位置提取一个完整的 JSON 对象字符串（花括号匹配）
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
 * 递归查找包含视频信息的对象
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
 * 使用 iesdouyin.com 分享页（无需签名/Cookie，只需移动端 UA）
 */
export async function getDouyinVideoInfo(videoId: string): Promise<{
  title: string
  cover: string
  author: string
  duration: number
  videoUrl: string
}> {
  // 请求分享预览页（iesdouyin.com，抖音给第三方 App 的分享页，不校验签名）
  const shareUrl = `https://www.iesdouyin.com/share/video/${videoId}`
  console.log('[Douyin] 请求分享页:', shareUrl)

  const resp = await fetch(shareUrl, {
    headers: {
      'User-Agent': MOBILE_UA,
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Cache-Control': 'no-cache',
    },
  })
  const html = await resp.text()

  console.log('[Douyin] 分享页响应长度:', html.length, '状态码:', resp.status)

  // 提取 _ROUTER_DATA
  const routerData = extractRouterDataJson(html)
  if (!routerData) {
    console.log('[Douyin] 未找到 _ROUTER_DATA，HTML预览:', html.substring(0, 500))
    throw new Error('解析抖音视频失败：分享页未包含视频数据（页面结构可能已变更）')
  }

  console.log('[Douyin] 找到 _ROUTER_DATA，顶层字段:', Object.keys(routerData))

  // 在 _ROUTER_DATA 中查找视频信息
  // parse-video 的路径: loaderData.video_(id)/page.videoInfoRes.item_list[0]
  // 但字段名可能因版本不同，用 deepFind 兜底
  let videoItem: any = null

  // 尝试路径1: loaderData -> video_(id)/page -> videoInfoRes -> item_list[0]
  const loaderData = routerData.loaderData || routerData.loaderData_
  if (loaderData) {
    for (const key of Object.keys(loaderData)) {
      const page = loaderData[key]
      if (page?.videoInfoRes?.item_list?.length) {
        videoItem = page.videoInfoRes.item_list[0]
        console.log('[Douyin] 从 loaderData.%s.videoInfoRes.item_list[0] 获取', key)
        break
      }
      // 也可能是 aweme_detail
      if (page?.aweme_detail) {
        videoItem = page.aweme_detail
        console.log('[Douyin] 从 loaderData.%s.aweme_detail 获取', key)
        break
      }
    }
  }

  // 兜底：递归查找包含 video + play_addr 的对象
  if (!videoItem) {
    videoItem = deepFind(
      routerData,
      (o) => o?.video?.play_addr?.url_list?.length > 0,
    )
    if (videoItem) console.log('[Douyin] 通过 deepFind 兜底获取')
  }

  if (!videoItem) {
    throw new Error('解析抖音视频失败：未在分享页中找到视频信息')
  }

  // 提取字段
  const video = videoItem.video || videoItem
  const author = videoItem.author || {}

  const title: string = videoItem.desc || videoItem.preview_title || ''
  const cover: string =
    video?.cover?.url_list?.[0] ||
    video?.origin_cover?.url_list?.[0] ||
    ''
  const authorName: string = author.nickname || author.name || ''
  const duration: number = Math.floor((video?.duration || 0) / 1000)

  // 无水印视频URL：play_addr 中的 url_list，把 playwm 替换为 play
  let noWatermarkUrl: string = ''
  const playAddr = video?.play_addr
  if (playAddr?.url_list?.length) {
    noWatermarkUrl = playAddr.url_list[0]
    // playwm -> play 获取无水印地址
    noWatermarkUrl = noWatermarkUrl.replace('playwm', 'play')
  }

  if (!noWatermarkUrl) {
    throw new Error('解析抖音视频失败：未找到视频播放地址')
  }

  console.log('[Douyin] 解析成功 - 标题:', title.substring(0, 30), '作者:', authorName)

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
  const { videoId } = await resolveDouyinUrl(url)
  const info = await getDouyinVideoInfo(videoId)

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
