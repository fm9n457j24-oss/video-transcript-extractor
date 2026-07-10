// 共享类型定义 - 前后端通用

export type Platform = 'bilibili' | 'douyin' | 'unknown';

export type SubtitleSource = 'subtitle' | 'asr';

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface VideoInfo {
  title: string;
  cover: string;
  author: string;
  duration: number;
  bvid?: string;
  platform: Platform;
}

export interface ExtractResult extends VideoInfo {
  subtitleSource: SubtitleSource;
  transcript: TranscriptSegment[];
}

// API 请求/响应类型
export interface ExtractRequest {
  url: string;
}

export interface ExtractResponse {
  success: boolean;
  data?: ExtractResult;
  error?: string;
  taskId?: string;
}

export interface ASRPollResponse {
  success: boolean;
  status: 'processing' | 'success' | 'failed';
  data?: {
    title?: string;
    cover?: string;
    author?: string;
    duration?: number;
    transcript: TranscriptSegment[];
  };
  error?: string;
}

// localStorage 历史记录
export interface HistoryItem {
  id: string;
  platform: Platform;
  url: string;
  title: string;
  cover: string;
  author: string;
  subtitleSource: SubtitleSource;
  transcriptText: string;
  transcriptSegments: TranscriptSegment[];
  createdAt: number;
}
