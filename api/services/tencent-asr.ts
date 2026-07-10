// 腾讯云ASR服务 - 录音文件识别（异步模式）
// 使用 Node.js 原生 crypto 模块实现 TC3-HMAC-SHA256 签名
import crypto from 'crypto'
import type { TranscriptSegment } from '../../shared/types.js'

const ASR_ENDPOINT = 'https://asr.tencentcloudapi.com/'
const HOST = 'asr.tencentcloudapi.com'
const SERVICE = 'asr'
const VERSION = '2019-06-14'

// 环境变量读取（trim 防止尾部空格/换行符导致签名失败）
function getEnvVar(name: string): string {
  if (typeof process !== 'undefined' && process.env && process.env[name]) {
    return (process.env[name] as string).trim()
  }
  return ''
}

/** SHA-256 摘要（hex） */
function sha256Hex(message: string): string {
  return crypto.createHash('sha256').update(message, 'utf8').digest('hex')
}

/** HMAC-SHA256（返回 Buffer） */
function hmacSha256(key: Buffer | string, message: string): Buffer {
  const keyData = typeof key === 'string' ? Buffer.from(key, 'utf8') : key
  return crypto.createHmac('sha256', keyData).update(message, 'utf8').digest()
}

/** Buffer 转 hex 字符串 */
function buf2hex(buffer: Buffer): string {
  return buffer.toString('hex')
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
  // 注意：与官方 SDK sign3 一致，POST 只签 content-type 和 host，不签 x-tc-action
  const hashedRequestPayload = sha256Hex(payloadStr)
  const canonicalHeaders =
    'content-type:application/json; charset=utf-8\n' + `host:${HOST}\n`
  const signedHeaders = 'content-type;host'
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
  const hashedCanonicalRequest = sha256Hex(canonicalRequest)
  const stringToSign = [
    'TC3-HMAC-SHA256',
    String(timestamp),
    credentialScope,
    hashedCanonicalRequest,
  ].join('\n')

  // ===== 3. 计算签名 =====
  const secretDate = hmacSha256('TC3' + secretKey, date)
  const secretService = hmacSha256(secretDate, SERVICE)
  const secretSigning = hmacSha256(secretService, 'tc3_request')
  const signature = buf2hex(hmacSha256(secretSigning, stringToSign))

  // ===== 4. 拼接 Authorization =====
  const authorization =
    `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  const headers: Record<string, string> = {
    Authorization: authorization,
    'Content-Type': 'application/json; charset=utf-8',
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
 * 支持两种模式：
 *   - URL模式：{ url: string } —— 传入公网可下载的音频URL
 *   - Data模式：{ data: string, dataLen: number } —— 传入base64编码的音频数据（≤5MB）
 */
export async function createASRTask(
  source: { url: string } | { data: string; dataLen: number },
): Promise<string> {
  const payload: Record<string, any> = {
    EngineModelType: '16k_zh',
    ChannelNum: 1,
    // 使用0：纯文本结果，最稳定，避免格式3的JSON解析问题
    ResTextFormat: 0,
  }

  if ('url' in source) {
    payload.SourceType = 0
    payload.Url = source.url
  } else {
    payload.SourceType = 1
    payload.Data = source.data
    payload.DataLen = source.dataLen
  }

  const result: any = await callAsrApi('CreateRecTask', payload)
  console.log('[ASR] CreateRecTask response:', JSON.stringify(result).substring(0, 1000))

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
 * 解析 ASR 识别结果
 * ResTextFormat=3 返回 { list: [{ start_time, end_time, text }] }，时间为毫秒
 * ResTextFormat=0/2 返回纯文本或带标点文本
 * 兼容多种可能的返回格式
 */
function parseAsrResult(resultStr: string): TranscriptSegment[] {
  if (!resultStr) return []
  try {
    const result = JSON.parse(resultStr)
    // 格式3: { list: [{ start_time, end_time, text }] }
    const list = result.list
    if (Array.isArray(list) && list.length > 0) {
      return list.map((item: any) => ({
        start: (item.start_time || 0) / 1000,
        end: (item.end_time || 0) / 1000,
        text: item.text || '',
      }))
    }
    // 兼容其他可能的数组格式
    if (Array.isArray(result) && result.length > 0) {
      return result.map((item: any) => ({
        start: (item.start_time || item.from || 0) / 1000,
        end: (item.end_time || item.to || 0) / 1000,
        text: item.text || item.content || '',
      }))
    }
    // 纯文本兜底：整段作为一个 segment
    if (typeof result === 'string' && result.trim()) {
      return [{ start: 0, end: 0, text: result.trim() }]
    }
    // { text: "xxx" } 格式
    if (result.text && typeof result.text === 'string') {
      return [{ start: 0, end: 0, text: result.text }]
    }
    return []
  } catch {
    // JSON.parse 失败，作为纯文本处理
    const text = resultStr.trim()
    if (text) {
      return [{ start: 0, end: 0, text }]
    }
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
  debug?: {
    statusCode?: number
    statusStr?: string
    resultStrPreview?: string
    errorMsg?: string
    allTaskKeys?: string[]
  }
}> {
  const payload = { TaskId: taskId }
  const result: any = await callAsrApi('DescribeTaskStatus', payload)

  console.log('[ASR] DescribeTaskStatus full response:', JSON.stringify(result).substring(0, 2000))

  if (result?.Response?.Error) {
    return {
      status: 'failed',
      error: result.Response.Error.Message || '查询任务状态失败',
    }
  }

  const data = result?.Response?.Data || {}
  const task = data.Task || data
  const status = task?.Status
  const statusStr = task?.StatusStr || ''

  // 打印 task 对象的所有字段名，帮助定位结果字段
  const allTaskKeys = task ? Object.keys(task) : []

  // 0=待处理 1=处理中
  if (status === 0 || status === 1) {
    return {
      status: 'processing',
      debug: { statusCode: status, statusStr, allTaskKeys },
    }
  }

  // 2=已完成
  if (status === 2) {
    const resultStr = task?.ResultStr || ''
    const transcript = parseAsrResult(resultStr)
    return {
      status: 'success',
      transcript,
      debug: {
        statusCode: status,
        statusStr,
        resultStrPreview: resultStr.substring(0, 500),
        allTaskKeys,
      },
    }
  }

  // 3=失败
  return {
    status: 'failed',
    error: task?.ErrorMsg || '识别失败',
    debug: {
      statusCode: status,
      statusStr,
      errorMsg: task?.ErrorMsg || '',
      allTaskKeys,
    },
  }
}
