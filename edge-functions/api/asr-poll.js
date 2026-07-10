// EdgeOne Edge Function - ASR 结果轮询
// 纯 JavaScript，内联腾讯云 ASR 服务逻辑，使用 Web Standards API
// 路由: GET /api/asr/poll?taskId=xxx

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

function parseAsrResult(resultStr) {
  try {
    const result = JSON.parse(resultStr)
    const list = result.list || []
    if (!Array.isArray(list)) return []
    return list.map((item) => ({
      start: (item.start_time || 0) / 1000,
      end: (item.end_time || 0) / 1000,
      text: item.text || '',
    }))
  } catch {
    return []
  }
}

async function pollASRTask(taskId, env) {
  const payload = { TaskId: taskId }
  const result = await callAsrApi('DescribeTaskStatus', payload, env)

  if (result && result.Response && result.Response.Error) {
    return {
      status: 'failed',
      error: result.Response.Error.Message || '查询任务状态失败',
    }
  }

  const data = (result && result.Response && result.Response.Data) || {}
  const task = data.Task || data
  const status = task && task.Status

  // 0=待处理 1=处理中
  if (status === 0 || status === 1) {
    return { status: 'processing' }
  }
  // 2=已完成
  if (status === 2) {
    const transcript = parseAsrResult((task && task.ResultStr) || '')
    return { status: 'success', transcript }
  }
  // 3=失败
  return { status: 'failed', error: (task && task.ErrorMsg) || '识别失败' }
}

// ===== Edge Function 入口 =====
export async function onRequest({ request, env }) {
  try {
    const url = new URL(request.url)
    const taskIdParam = url.searchParams.get('taskId')
    if (!taskIdParam) {
      return jsonResponse(
        { success: false, status: 'failed', error: '缺少 taskId 参数' },
        400,
      )
    }

    const taskId = Number(taskIdParam)
    if (!Number.isFinite(taskId)) {
      return jsonResponse(
        { success: false, status: 'failed', error: 'taskId 参数无效' },
        400,
      )
    }

    const result = await pollASRTask(taskId, env)

    if (result.status === 'success') {
      return jsonResponse({
        success: true,
        status: 'success',
        data: { transcript: result.transcript || [] },
      })
    } else if (result.status === 'failed') {
      return jsonResponse({
        success: false,
        status: 'failed',
        error: result.error || '识别失败',
      })
    }
    return jsonResponse({ success: true, status: 'processing' })
  } catch (err) {
    return jsonResponse({
      success: false,
      status: 'failed',
      error: (err && err.message) || '轮询失败',
    })
  }
}
