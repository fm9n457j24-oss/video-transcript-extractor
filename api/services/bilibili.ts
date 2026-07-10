// B站服务 - 仅使用 fetch API，不依赖 Node.js 专有模块
import fs from 'fs'
import path from 'path'
import os from 'os'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import type {
  TranscriptSegment,
  VideoInfo,
  SubtitleSource,
} from '../../shared/types.js'

const BILI_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
const BV_REGEX = /BV[a-zA-Z0-9]{10}/

// 临时音频文件目录
const AUDIO_TEMP_DIR = path.join(os.tmpdir(), 'bili-audio-temp')
try {
  if (!fs.existsSync(AUDIO_TEMP_DIR)) {
    fs.mkdirSync(AUDIO_TEMP_DIR, { recursive: true })
  }
} catch {}

/**
 * 下载音频到临时文件（流式写入，避免大文件OOM）
 * B站CDN需要 Referer 头，否则返回403，腾讯云ASR直接下载会失败
 */
export async function downloadAudioFile(
  audioUrl: string,
): Promise<{ filePath: string; size: number }> {
  const resp = await fetch(audioUrl, {
    headers: {
      'User-Agent': BILI_USER_AGENT,
      Referer: 'https://www.bilibili.com',
    },
  })
  if (!resp.ok || !resp.body) {
    throw new Error(`下载B站音频失败: HTTP ${resp.status}`)
  }
  // 检查响应类型，B站防盗链可能返回HTML错误页而非音频
  const contentType = resp.headers.get('content-type') || ''
  if (contentType.includes('text/html')) {
    throw new Error('B站音频URL返回了HTML页面（可能需要登录或已被防盗链拦截）')
  }
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const filePath = path.join(AUDIO_TEMP_DIR, `${id}.m4a`)
  const fileStream = fs.createWriteStream(filePath)
  await pipeline(Readable.fromWeb(resp.body as any), fileStream)
  const size = fs.statSync(filePath).size
  // 文件过小（<1KB）通常是错误响应
  if (size < 1024) {
    const content = fs.readFileSync(filePath, 'utf8').substring(0, 200)
    fs.unlinkSync(filePath)
    throw new Error(`下载的音频文件过小（${size}字节），内容: ${content}`)
  }
  return { filePath, size }
}

/**
 * 清理临时音频文件
 */
export function cleanupAudioFile(
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
 * 从 URL 中解析 BV 号（同步，仅正则匹配）
 * 支持 BV1xxxx、完整URL 中包含 BV 号的情况
 */
export function parseBvid(url: string): string | null {
  const match = url.match(BV_REGEX)
  return match ? match[0] : null
}

/**
 * 解析 BV 号，支持 b23.tv 短链（需要 fetch 跟随重定向）
 */
async function resolveBvid(url: string): Promise<string | null> {
  // 先直接正则匹配
  const direct = parseBvid(url)
  if (direct) return direct

  // b23.tv 短链需要跟随重定向获取真实 URL
  if (url.includes('b23.tv')) {
    try {
      const resp = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'User-Agent': BILI_USER_AGENT },
      })
      const finalUrl = resp.url || ''
      return parseBvid(finalUrl)
    } catch {
      return null
    }
  }

  return null
}

/**
 * 获取视频信息
 */
export async function getVideoInfo(bvid: string): Promise<{
  title: string
  cover: string
  author: string
  duration: number
  cid: number
}> {
  const resp = await fetch(
    `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
    { headers: { 'User-Agent': BILI_USER_AGENT } },
  )
  const json: any = await resp.json()
  const data = json?.data
  if (!data) {
    throw new Error('获取B站视频信息失败')
  }
  return {
    title: data.title ?? '',
    cover: data.pic ?? '',
    author: data.owner?.name ?? '',
    duration: data.duration ?? 0,
    cid: data.cid ?? 0,
  }
}

/**
 * 获取字幕URL（优先中文字幕）
 */
export async function getSubtitleUrl(
  bvid: string,
  cid: number,
): Promise<string | null> {
  const resp = await fetch(
    `https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${cid}`,
    { headers: { 'User-Agent': BILI_USER_AGENT } },
  )
  const json: any = await resp.json()
  const subtitles = json?.data?.subtitle?.subtitles
  if (!Array.isArray(subtitles) || subtitles.length === 0) {
    return null
  }
  // 优先中文字幕
  const zh =
    subtitles.find(
      (s: any) => s.lan === 'zh-CN' || s.lan === 'ai-zh',
    ) || subtitles[0]
  let subtitleUrl: string = zh.subtitle_url
  if (!subtitleUrl) return null
  if (subtitleUrl.startsWith('//')) {
    subtitleUrl = 'https:' + subtitleUrl
  }
  return subtitleUrl
}

/**
 * 获取字幕内容并转换为 TranscriptSegment
 */
export async function fetchSubtitle(
  subtitleUrl: string,
): Promise<TranscriptSegment[]> {
  const resp = await fetch(subtitleUrl, {
    headers: { 'User-Agent': BILI_USER_AGENT },
  })
  const json: any = await resp.json()
  const body = json?.body
  if (!Array.isArray(body)) return []
  return body.map((item: any) => ({
    start: item.from ?? 0,
    end: item.to ?? 0,
    text: item.content ?? '',
  }))
}

/**
 * 获取音频流URL（DASH格式）
 */
export async function getAudioStreamUrl(
  bvid: string,
  cid: number,
): Promise<string | null> {
  const resp = await fetch(
    `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&fnval=16`,
    { headers: { 'User-Agent': BILI_USER_AGENT } },
  )
  const json: any = await resp.json()
  const audio = json?.data?.dash?.audio
  if (!Array.isArray(audio) || audio.length === 0) return null
  // 选择最低质量音频流（数组按质量降序，最后一个文件最小）
  const smallest = audio[audio.length - 1]
  return smallest.baseUrl || smallest.base_url || null
}

/**
 * 整合B站文案提取流程
 * 1. 解析BV号
 * 2. 获取视频信息
 * 3. 查找字幕 -> 有字幕则提取返回
 * 4. 无字幕则获取音频流URL返回（后续由调用方触发ASR）
 */
export async function extractBilibili(url: string): Promise<{
  videoInfo: VideoInfo
  transcript?: TranscriptSegment[]
  subtitleSource: SubtitleSource
  audioUrl?: string
  taskId?: string
}> {
  const bvid = await resolveBvid(url)
  if (!bvid) {
    throw new Error('无法解析BV号，请检查链接是否正确')
  }

  const info = await getVideoInfo(bvid)
  const videoInfo: VideoInfo = {
    title: info.title,
    cover: info.cover,
    author: info.author,
    duration: info.duration,
    bvid,
    platform: 'bilibili',
  }

  // 优先尝试字幕
  const subtitleUrl = await getSubtitleUrl(bvid, info.cid)
  if (subtitleUrl) {
    const transcript = await fetchSubtitle(subtitleUrl)
    return {
      videoInfo,
      transcript,
      subtitleSource: 'subtitle',
    }
  }

  // 无字幕，获取音频流URL供 ASR 使用
  const audioUrl = await getAudioStreamUrl(bvid, info.cid)
  return {
    videoInfo,
    subtitleSource: 'asr',
    audioUrl: audioUrl || undefined,
  }
}
