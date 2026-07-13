// 抖音服务 - 带反爬绕过（获取 ttwid cookie）
import fs from 'fs'
import path from 'path'
import os from 'os'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import type { VideoInfo } from '../../shared/types.js'

// 桌面浏览器 UA（抖音对桌面 UA 的反爬相对宽松）
const DOUYIN_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
const DOUYIN_REFERER = 'https://www.douyin.com/'

// 临时视频文件目录
const VIDEO_TEMP_DIR = path.join(os.tmpdir(), 'douyin-video-temp')
try {
  if (!fs.existsSync(VIDEO_TEMP_DIR)) {
    fs.mkdirSync(VIDEO_TEMP_DIR, { recursive: true })
  }
} catch {}

// 缓存 ttwid cookie（有效期较长，避免每次请求都获取）
let cachedTtwid = ''
let ttwidExpireAt = 0

/**
 * 获取 ttwid cookie
 * 访问抖音首页，从 Set-Cookie 响应头中提取 ttwid
 */
async function getTtwid(): Promise<string> {
  // 使用缓存（1小时内有效）
  const now = Date.now()
  if (cachedTtwid && now < ttwidExpireAt) {
    return cachedTtwid
  }

  try {
    const resp = await fetch('https://www.douyin.com/', {
      method: 'GET',
      redirect: 'manual', // 不跟随重定向，只拿 Set-Cookie
      headers: {
        'User-Agent': DOUYIN_UA,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        'sec-ch-ua':
          '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'Upgrade-Insecure-Requests': '1',
      },
    })

    // 从 Set-Cookie 头提取 ttwid
    const setCookieHeaders = resp.headers.getSetCookie?.() || []
    // 兼容：手动从 headers 中查找
    let allCookies: string[] = setCookieHeaders
    if (allCookies.length === 0) {
      // Node.js fetch 可能将多个 Set-Cookie 合并
      const raw = resp.headers.get('set-cookie')
      if (raw) allCookies = raw.split(/,(?=\s*\w+=)/)
    }

    for (const cookie of allCookies) {
      const match = cookie.match(/ttwid=([^;]+)/)
      if (match) {
        cachedTtwid = `ttwid=${match[1]}`
        ttwidExpireAt = now + 50 * 60 * 1000 // 50分钟
        console.log('[Douyin] 获取 ttwid 成功')
        return cachedTtwid
      }
    }
    console.log('[Douyin] 未从响应中找到 ttwid，继续尝试无 cookie 访问')
  } catch (err) {
    console.log('[Douyin] 获取 ttwid 失败:', (err as Error).message)
  }
  return ''
}

/**
 * 下载抖音视频到临时文件（流式写入，避免大文件OOM）
 */
export async function downloadVideoFile(
  videoUrl: string,
): Promise<{ filePath: string; size: number }> {
  const resp = await fetch(videoUrl, {
    headers: {
      'User-Agent': MOBILE_UA,
      Referer: DOUYIN_REFERER,
    },
  })
  if (!resp.ok || !resp.body) {
    throw new Error(`下载抖音视频失败: HTTP ${resp.status}`)
  }
  // 检查响应类型，防盗链可能返回 HTML 错误页
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
 * 解析短链获取真实URL
 */
export async function resolveDouyinUrl(url: string): Promise<string> {
  const rawUrl = extractUrlFromText(url) || url
  const resp = await fetch(rawUrl, {
    method: 'GET',
    redirect: 'follow',
    headers: { 'User-Agent': MOBILE_UA },
  })
  const finalUrl = resp.url || rawUrl
  return finalUrl
}

/**
 * 从视频URL中提取视频ID
 * 格式: https://www.douyin.com/video/7234567890123456789
 * 或: https://www.douyin.com/discover?modal_id=7234567890123456789
 */
function extractVideoId(url: string): string | null {
  // /video/{id}
  let match = url.match(/\/video\/(\d+)/)
  if (match) return match[1]
  // modal_id={id}
  match = url.match(/modal_id=(\d+)/)
  if (match) return match[1]
  // /note/{id}
  match = url.match(/\/note\/(\d+)/)
  if (match) return match[1]
  return null
}

/**
 * 从指定起始位置提取一个完整的 JSON 对象字符串
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
 * 构建请求头（带 cookie）
 */
function buildHeaders(cookie: string, isMobile: boolean = false): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': isMobile ? MOBILE_UA : DOUYIN_UA,
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Referer: DOUYIN_REFERER,
    'sec-ch-ua':
      '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Upgrade-Insecure-Requests': '1',
  }
  if (cookie) {
    headers.Cookie = cookie
  }
  return headers
}

/**
 * 获取抖音视频信息
 * 策略：先获取 ttwid cookie，然后用 cookie 访问视频页面解析 _ROUTER_DATA
 */
export async function getDouyinVideoInfo(videoUrl: string): Promise<{
  title: string
  cover: string
  author: string
  duration: number
  videoUrl: string
}> {
  // 1. 获取 ttwid cookie
  const ttwid = await getTtwid()

  // 2. 提取视频ID，构造标准视频页面URL
  const videoId = extractVideoId(videoUrl)
  const targetUrl = videoId
    ? `https://www.douyin.com/video/${videoId}`
    : videoUrl

  console.log('[Douyin] 请求视频页面:', targetUrl, 'ttwid:', ttwid ? 'yes' : 'no')

  // 3. 用 cookie 请求视频页面
  const resp = await fetch(targetUrl, {
    headers: buildHeaders(ttwid, false),
  })
  const html = await resp.text()

  console.log('[Douyin] 页面响应长度:', html.length, '状态码:', resp.status)

  let videoObj: any = null

  // 解析 _ROUTER_DATA
  const routerData = parseRouterData(html)
  if (routerData) {
    console.log('[Douyin] 找到 _ROUTER_DATA')
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
    // 输出部分 HTML 帮助调试
    const htmlPreview = html.substring(0, 500)
    console.log('[Douyin] 解析失败，HTML预览:', htmlPreview)
    throw new Error('解析抖音视频信息失败，可能存在反爬限制或页面结构已变更')
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
