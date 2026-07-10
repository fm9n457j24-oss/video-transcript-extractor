// EdgeOne Edge Function - 抖音文案提取
// 纯 JavaScript，内联所有服务逻辑，使用 Web Standards API
// 路由: POST /api/douyin

const DOUYIN_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
const DOUYIN_REFERER = 'https://www.douyin.com/'

const ASR_ENDPOINT = 'https://asr.tencentcloudapi.com/'
const ASR_HOST = 'asr.tencentcloudapi.com'
const ASR_SERVICE = 'asr'
const ASR_VERSION = '2019-06-14'

const encoder = new TextEncoder()

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ===== 抖音服务 =====
function extractUrlFromText(text) {
  const match = text.match(/https?:\/\/[^\s，,。]+/)
  return match ? match[0] : null
}

async function resolveDouyinUrl(url) {
  const rawUrl = extractUrlFromText(url) || url
  const resp = await fetch(rawUrl, {
    method: 'GET',
    redirect: 'follow',
    headers: { 'User-Agent': DOUYIN_UA },
  })
  return resp.url || rawUrl
}

function extractJsonObject(text, startIndex) {
  if (text[startIndex] !== '{') return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i]
    if (escape) { escape = false; continue }
    if (ch === '\\') { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(startIndex, i + 1)
    }
  }
  return null
}

function parseRouterData(html) {
  const marker = 'window._ROUTER_DATA'
  const idx = html.indexOf(marker)
  if (idx === -1) return null
  const eqIdx = html.indexOf('=', idx)
  if (eqIdx === -1) return null
  const braceIdx = html.indexOf('{', eqIdx)
  if (braceIdx === -1) return null

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

function deepFind(obj, predicate) {
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

async function getDouyinVideoInfo(videoUrl) {
  const resp = await fetch(videoUrl, {
    headers: { 'User-Agent': DOUYIN_UA, Referer: DOUYIN_REFERER },
  })
  const html = await resp.text()

  let videoObj = null
  const routerData = parseRouterData(html)
  if (routerData) {
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

  const item = (videoObj && videoObj.item) || (videoObj && videoObj.awemeDetail) || videoObj
  const video = (item && item.video) || (videoObj && videoObj.video)
  const author = (item && item.author) || (videoObj && videoObj.author)

  const title = (item && item.desc) || (videoObj && videoObj.desc) || (item && item.preview_title) || ''
  const cover =
    (video && video.cover && video.cover.url_list && video.cover.url_list[0]) ||
    (video && video.origin_cover && video.origin_cover.url_list && video.origin_cover.url_list[0]) ||
    (item && item.video && item.video.cover && item.video.cover.url_list && item.video.cover.url_list[0]) ||
    ''
  const authorName = (author && author.nickname) || (author && author.name) || ''
  const duration = Math.floor((video && video.duration) || (item && item.duration) || 0) / 1000

  let noWatermarkUrl = ''
  const playAddr =
    (video && video.play_addr) ||
    (item && item.video && item.video.play_addr) ||
    (videoObj && videoObj.play_addr)
  if (playAddr && playAddr.url_list && playAddr.url_list.length) {
    noWatermarkUrl = playAddr.url_list[0]
    noWatermarkUrl = noWatermarkUrl.replace('playwm', 'play')
  }

  if (!title && !noWatermarkUrl) {
    throw new Error('解析抖音视频信息失败，可能存在反爬限制')
  }

  return { title, cover, author: authorName, duration, videoUrl: noWatermarkUrl }
}

async function extractDouyin(url) {
  const realUrl = await resolveDouyinUrl(url)
  const info = await getDouyinVideoInfo(realUrl)
  const videoInfo = {
    title: info.title,
    cover: info.cover,
    author: info.author,
    duration: info.duration,
    platform: 'douyin',
  }
  return { videoInfo, videoUrl: info.videoUrl }
}

// ===== 腾讯云 ASR 服务 =====
async function sha256Hex(message) {
  const buf = await crypto.subtle.digest('SHA-256', encoder.encode(message))
  return buf2hex(buf)
}

async function hmacSha256(key, message) {
  const keyData = typeof key === 'string' ? encoder.encode(key) : new Uint8Array(key)
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message))
}

function buf2hex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((b) => ('00' + b.toString(16)).slice(-2))
    .join('')
}

async function callAsrApi(action, payload, env) {
  const secretId = env.TENCENT_SECRET_ID
  const secretKey = env.TENCENT_SECRET_KEY
  if (!secretId || !secretKey) {
    throw new Error('腾讯云ASR环境变量未配置（TENCENT_SECRET_ID / TENCENT_SECRET_KEY）')
  }

  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const payloadStr = JSON.stringify(payload)

  const hashedRequestPayload = await sha256Hex(payloadStr)
  const canonicalHeaders =
    'content-type:application/json; charset=utf-8\n' +
    `host:${ASR_HOST}\n` +
    `x-tc-action:${action.toLowerCase()}\n`
  const signedHeaders = 'content-type;host;x-tc-action'
  const canonicalRequest = [
    'POST', '/', '', canonicalHeaders, signedHeaders, hashedRequestPayload,
  ].join('\n')

  const credentialScope = `${date}/${ASR_SERVICE}/tc3_request`
  const hashedCanonicalRequest = await sha256Hex(canonicalRequest)
  const stringToSign = [
    'TC3-HMAC-SHA256', String(timestamp), credentialScope, hashedCanonicalRequest,
  ].join('\n')

  const secretDate = await hmacSha256('TC3-HMAC-SHA256' + secretKey, date)
  const secretService = await hmacSha256(secretDate, ASR_SERVICE)
  const secretSigning = await hmacSha256(secretService, 'tc3_request')
  const signature = buf2hex(await hmacSha256(secretSigning, stringToSign))

  const authorization =
    `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  const resp = await fetch(ASR_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json; charset=utf-8',
      Host: ASR_HOST,
      'X-TC-Action': action,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Version': ASR_VERSION,
    },
    body: payloadStr,
  })
  return resp.json()
}

async function createASRTask(audioUrl, env) {
  const payload = {
    EngineModelType: '16k_zh',
    ChannelNum: 1,
    ResTextFormat: 3,
    Url: audioUrl,
    SourceType: 0,
  }
  const result = await callAsrApi('CreateRecTask', payload, env)
  if (result && result.Response && result.Response.Error) {
    throw new Error(result.Response.Error.Message || '创建ASR任务失败')
  }
  const taskId = result && result.Response && result.Response.Data && result.Response.Data.TaskId
  if (taskId === undefined || taskId === null) {
    throw new Error('创建ASR任务失败：未返回 TaskId')
  }
  return String(taskId)
}

// ===== Edge Function 入口 =====
export async function onRequest({ request, env }) {
  try {
    const body = await request.json()
    const url = body && body.url
    if (!url || typeof url !== 'string') {
      return jsonResponse({ success: false, error: '缺少 url 参数' }, 400)
    }

    const result = await extractDouyin(url)

    if (!result.videoUrl) {
      return jsonResponse({ success: false, error: '无法获取视频地址，请稍后重试' }, 500)
    }

    const taskId = await createASRTask(result.videoUrl, env)
    return jsonResponse({
      success: true,
      taskId,
      data: {
        ...result.videoInfo,
        subtitleSource: 'asr',
        transcript: [],
      },
    })
  } catch (err) {
    return jsonResponse(
      { success: false, error: (err && err.message) || '提取失败' },
      500,
    )
  }
}
