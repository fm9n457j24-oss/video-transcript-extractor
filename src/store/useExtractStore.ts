import { create } from 'zustand';
import type { Platform, ExtractResult } from '../../shared/types';
import { extractVideo, pollASR } from '@/lib/api';
import { detectPlatform } from '@/lib/platform';
import { addHistory } from '@/lib/history';

interface ExtractState {
  url: string;
  platform: Platform;
  status: 'idle' | 'extracting' | 'polling' | 'success' | 'error';
  step: number; // 0-4: 解析链接→获取信息→获取字幕/音频→语音识别→完成
  result: ExtractResult | null;
  taskId: string | null;
  error: string | null;
  setUrl: (url: string) => void;
  extract: () => Promise<void>;
  reset: () => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function saveToHistory(result: ExtractResult, url: string) {
  const transcriptText = result.transcript.map((s) => s.text).join(' ');
  addHistory({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    platform: result.platform,
    url,
    title: result.title,
    cover: result.cover,
    author: result.author,
    subtitleSource: result.subtitleSource,
    transcriptText,
    transcriptSegments: result.transcript,
    createdAt: Date.now(),
  });
}

export const useExtractStore = create<ExtractState>()((set, get) => {
  // 轮询 ASR 任务结果：间隔 3s，最多 40 次（约 2 分钟）
  const runPolling = async (
    taskId: string,
    url: string,
    partial?: Partial<ExtractResult>,
  ) => {
    const MAX_POLLS = 40;
    const INTERVAL = 3000;
    for (let i = 0; i < MAX_POLLS; i++) {
      try {
        const poll = await pollASR(taskId);
        if (poll.status === 'success' && poll.data) {
          const platform = get().platform;
          const transcript = poll.data.transcript || [];
          const result: ExtractResult = {
            title: partial?.title || poll.data.title || '未知标题',
            cover: partial?.cover || poll.data.cover || '',
            author: partial?.author || poll.data.author || '未知作者',
            duration: partial?.duration || poll.data.duration || 0,
            bvid: partial?.bvid,
            platform,
            subtitleSource: 'asr',
            transcript,
          };
          // 如果识别成功但文案为空，显示调试信息帮助排查
          if (transcript.length === 0) {
            const dbg = poll.debug
              ? `（调试: status=${poll.debug.statusCode}, str=${poll.debug.statusStr || ''}, keys=${poll.debug.allTaskKeys?.join(',') || ''}, preview=${(poll.debug.resultStrPreview || '').substring(0, 200)}）`
              : '';
            set({ status: 'error', error: `语音识别完成但未返回文案内容${dbg}` });
            return;
          }
          set({ status: 'success', step: 4, result });
          saveToHistory(result, url);
          return;
        }
        if (poll.status === 'failed') {
          const dbg = poll.debug?.errorMsg ? `（${poll.debug.errorMsg}）` : '';
          set({ status: 'error', error: (poll.error || '语音识别失败') + dbg });
          return;
        }
      } catch {
        // 单次网络错误，继续轮询
      }
      await sleep(INTERVAL);
    }
    set({ status: 'error', error: '识别超时，请稍后重试' });
  };

  return {
    url: '',
    platform: 'unknown',
    status: 'idle',
    step: 0,
    result: null,
    taskId: null,
    error: null,
    setUrl: (url) => set({ url, platform: detectPlatform(url) }),
    reset: () =>
      set({
        url: '',
        platform: 'unknown',
        status: 'idle',
        step: 0,
        result: null,
        taskId: null,
        error: null,
      }),
    extract: async () => {
      const { url } = get();
      if (!url.trim()) return;
      set({ status: 'extracting', step: 1, error: null, result: null, taskId: null });
      try {
        const resp = await extractVideo(url);
        if (!resp.success) {
          set({ status: 'error', error: resp.error || '提取失败' });
          return;
        }
        // 返回 taskId（需要 ASR 轮询）— 优先检查 taskId
        if (resp.taskId) {
          set({ status: 'polling', step: 3, taskId: resp.taskId });
          await runPolling(resp.taskId, url, resp.data);
          return;
        }
        // 直接返回数据（已有字幕）
        if (resp.data && resp.data.transcript && resp.data.transcript.length > 0) {
          set({ status: 'success', step: 4, result: resp.data });
          saveToHistory(resp.data, url);
          return;
        }
        set({ status: 'error', error: '提取失败：未获取到文案内容，请重试' });
      } catch (e) {
        set({ status: 'error', error: e instanceof Error ? e.message : '网络错误' });
      }
    },
  };
});
