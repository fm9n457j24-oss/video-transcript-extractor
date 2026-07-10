// 腾讯云ASR服务 - 录音文件识别（异步模式）
// 使用 Web Crypto API 实现 TC3-HMAC-SHA256 签名，兼容 Edge 环境
import type { TranscriptSegment } from '../../shared/types.js'

const ASR_ENDPOINT = 'https://asr.tencentcloudapi.com/'
const HOST = 'asr.tencentcloudapi.com'
const SERVICE = 'asr'
const VERSION = '2019-06-14'

// 环境变量读取（兼容 Node 与 Edge）
function getEnvVar(name: string): string {
  if (typeof process !== 'undefined' && process.env && process.env[name]) {
    return process.env[name] as string
  }
  return ''
}

const encoder = new TextEncoder()

/** SHA-256 摘要（hex） */
async function sha256Hex(message: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', encoder.encode(message))
  return buf2hex(buf)
}

/** HMAC-SHA256 */
async function hmacSha256(
  key: ArrayBuffer | string,
  message: string,
): Promise<ArrayBuffer> {
  const keyData =
    typeof key === 'string' ? encoder.encode(key) : new Uint8Array(key)
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message))
}

/** ArrayBuffer 转 hex 字符串 */
function buf2hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((b) => ('00' + b.toString(16)).slice(-2))
    .join('')
}

/**
 * 调用腾讯云 ASR API（带 TC3-HMAC-SHA256 签名）
 */
async function callAsrApi(action: string, payload: object): Promise<any> {
  const secretId = getEnvVar('TENCENT_SECRET_ID')
  const secretKey = getEnvVar('TENCENT_SECRET_KEY')

  if (!secretId || !secretKey) {
    throw new Error('腾讯云ASR环境变量未配置（TENCENT_SECRET_ID / TENCENT_SECRET_KEY）')
  }

  const timestamp = Math.floor(Date.now() / 1000)
  // UTC 日期 YYYY-MM-DD
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)

  const payloadStr = JSON.stringify(payload)

  // ===== 1. 拼接 CanonicalRequest =====
  const hashedRequestPayload = await sha256Hex(payloadStr)
  const canonicalHeaders =
    'content-type:application/json; charset=utf-8\n' +
    `host:${HOST}\n` +
    `x-tc-action:${action.toLowerCase()}\n`
  const signedHeaders = 'content-type;host;x-tc-action'
  const canonicalRequest = [
    'POST',
    '/',
    '',
    canonicalHeaders,
    signedHeaders,
    hashedRequestPayload,
  ].join('\n')

  // ===== 2. 拼接 StringToSign =====
  const credentialScope = `${date}/${SERVICE}/tc3_request`
  const hashedCanonicalRequest = await sha256Hex(canonicalRequest)
  const stringToSign = [
    'TC3-HMAC-SHA256',
    String(timestamp),
    credentialScope,
    hashedCanonicalRequest,
  ].join('\n')

  // ===== 3. 计算签名 =====
  const secretDate = await hmacSha256('TC3-HMAC-SHA256' + secretKey, date)
  const secretService = await hmacSha256(secretDate, SERVICE)
  const secretSigning = await hmacSha256(secretService, 'tc3_request')
  const signature = buf2hex(await hmacSha256(secretSigning, stringToSign))

  // ===== 4. 拼接 Authorization =====
  const authorization =
    `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  const headers: Record<string, string> = {
    Authorization: authorization,
    'Content-Type': 'application/json; charset=utf-8',
    Host: HOST,
    'X-TC-Action': action,
    'X-TC-Timestamp': String(timestamp),
    'X-TC-Version': VERSION,
  }

  const resp = await fetch(ASR_ENDPOINT, {
    method: 'POST',
    headers,
    body: payloadStr,
  })
  return resp.json()
}

/**
 * 创建识别任务
 * ResTextFormat=3 返回带时间戳的结果
 */
export async function createASRTask(audioUrl: string): Promise<string> {
  const payload = {
    EngineModelType: '16k_zh',
    ChannelNum: 1,
    ResTextFormat: 3,
    Url: audioUrl,
    SourceType: 0,
  }

  const result: any = await callAsrApi('CreateRecTask', payload)

  if (result?.Response?.Error) {
    throw new Error(result.Response.Error.Message || '创建ASR任务失败')
  }

  const taskId = result?.Response?.Data?.TaskId
  if (taskId === undefined || taskId === null) {
    throw new Error('创建ASR任务失败：未返回 TaskId')
  }
  return String(taskId)
}

/**
 * 解析 ASR 识别结果（带时间戳，时间为毫秒）
 */
function parseAsrResult(resultStr: string): TranscriptSegment[] {
  try {
    const result = JSON.parse(resultStr)
    const list = result.list || []
    if (!Array.isArray(list)) return []
    return list.map((item: any) => ({
      start: (item.start_time || 0) / 1000,
      end: (item.end_time || 0) / 1000,
      text: item.text || '',
    }))
  } catch {
    return []
  }
}

/**
 * 轮询任务结果
 * Status: 0=待处理 1=处理中 2=已完成 3=失败
 */
export async function pollASRTask(taskId: number): Promise<{
  status: 'processing' | 'success' | 'failed'
  transcript?: TranscriptSegment[]
  error?: string
}> {
  const payload = { TaskId: taskId }
  const result: any = await callAsrApi('DescribeTaskStatus', payload)

  if (result?.Response?.Error) {
    return {
      status: 'failed',
      error: result.Response.Error.Message || '查询任务状态失败',
    }
  }

  const data = result?.Response?.Data || {}
  const task = data.Task || data
  const status = task?.Status

  // 0=待处理 1=处理中
  if (status === 0 || status === 1) {
    return { status: 'processing' }
  }

  // 2=已完成
  if (status === 2) {
    const transcript = parseAsrResult(task?.ResultStr || '')
    return { status: 'success', transcript }
  }

  // 3=失败
  return {
    status: 'failed',
    error: task?.ErrorMsg || '识别失败',
  }
}
