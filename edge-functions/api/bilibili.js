// EdgeOne Edge Function - B站文案提取
// 纯 JavaScript，内联所有服务逻辑，使用 Web Standards API
// 路由: POST /api/bilibili

const BILI_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
const BV_REGEX = /BV[a-zA-Z0-9]{10}/

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

// ===== B站服务 =====
function parseBvid(url) {
  const match = url.match(BV_REGEX)
  return match ? match[0] : null
}

async function resolveBvid(url) {
  const direct = parseBvid(url)
  if (direct) return direct
  if (url.includes('b23.tv')) {
    try {
      const resp = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'User-Agent': BILI_USER_AGENT },
      })
      return parseBvid(resp.url || '')
    } catch {
      return null
    }
  }
  return null
}

async function getVideoInfo(bvid) {
  const resp = await fetch(
    `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
    { headers: { 'User-Agent': BILI_USER_AGENT } },
  )
  const json = await resp.json()
  const data = json && json.data
  if (!data) throw new Error('获取B站视频信息失败')
  return {
    title: data.title || '',
    cover: data.pic || '',
    author: (data.owner && data.owner.name) || '',
    duration: data.duration || 0,
    cid: data.cid || 0,
  }
}

async function getSubtitleUrl(bvid, cid) {
  const resp = await fetch(
    `https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${cid}`,
    { headers: { 'User-Agent': BILI_USER_AGENT } },
  )
  const json = await resp.json()
  const subtitles = json && json.data && json.data.subtitle && json.data.subtitle.subtitles
  if (!Array.isArray(subtitles) || subtitles.length === 0) return null
  const zh =
    subtitles.find((s) => s.lan === 'zh-CN' || s.lan === 'ai-zh') ||
    subtitles[0]
  let subtitleUrl = zh.subtitle_url
  if (!subtitleUrl) return null
  if (subtitleUrl.startsWith('//')) subtitleUrl = 'https:' + subtitleUrl
  return subtitleUrl
}

async function fetchSubtitle(subtitleUrl) {
  const resp = await fetch(subtitleUrl, {
    headers: { 'User-Agent': BILI_USER_AGENT },
  })
  const json = await resp.json()
  const body = json && json.body
  if (!Array.isArray(body)) return []
  return body.map((item) => ({
    start: item.from || 0,
    end: item.to || 0,
    text: item.content || '',
  }))
}

async function getAudioStreamUrl(bvid, cid) {
  const resp = await fetch(
    `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&fnval=16`,
    { headers: { 'User-Agent': BILI_USER_AGENT } },
  )
  const json = await resp.json()
  const audio = json && json.data && json.data.dash && json.data.dash.audio
  if (!Array.isArray(audio) || audio.length === 0) return null
  return audio[0].baseUrl || audio[0].base_url || null
}

async function extractBilibili(url) {
  const bvid = await resolveBvid(url)
  if (!bvid) throw new Error('无法解析BV号，请检查链接是否正确')
  const info = await getVideoInfo(bvid)
  const videoInfo = {
    title: info.title,
    cover: info.cover,
    author: info.author,
    duration: info.duration,
    bvid,
    platform: 'bilibili',
  }
  const subtitleUrl = await getSubtitleUrl(bvid, info.cid)
  if (subtitleUrl) {
    const transcript = await fetchSubtitle(subtitleUrl)
    return { videoInfo, transcript, subtitleSource: 'subtitle' }
  }
  const audioUrl = await getAudioStreamUrl(bvid, info.cid)
  return { videoInfo, subtitleSource: 'asr', audioUrl: audioUrl || undefined }
}

// ===== 腾讯云 ASR 服务 =====
async function sha256Hex(message) {
  const buf = await crypto.subtle.digest('SHA-256', encoder.encode(message))
  return buf2hex(buf)
}

async function hmacSha256(key, message) {
  const keyData = typeof key === 'string' ? encoder.encode(key) : new Uint8Array(key)
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
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

    const result = await extractBilibili(url)

    if (result.subtitleSource === 'subtitle' && result.transcript) {
      return jsonResponse({
        success: true,
        data: {
          ...result.videoInfo,
          subtitleSource: 'subtitle',
          transcript: result.transcript,
        },
      })
    }

    if (!result.audioUrl) {
      return jsonResponse({ success: false, error: '无法获取音频流，请稍后重试' }, 500)
    }

    const taskId = await createASRTask(result.audioUrl, env)
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
