import type { ExtractResponse, ASRPollResponse } from '../../shared/types';
import { detectPlatform } from './platform';

// 根据平台调用对应提取接口
export async function extractVideo(url: string): Promise<ExtractResponse> {
  const platform = detectPlatform(url);
  const endpoint = platform === 'douyin' ? '/api/douyin' : '/api/bilibili';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  return (await res.json()) as ExtractResponse;
}

// 轮询 ASR 任务结果
export async function pollASR(taskId: string): Promise<ASRPollResponse> {
  const res = await fetch(`/api/asr/poll?taskId=${encodeURIComponent(taskId)}`);
  return (await res.json()) as ASRPollResponse;
}
