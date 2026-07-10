import Navbar from '@/components/Navbar';
import UrlInput from '@/components/UrlInput';
import ExtractionStatus from '@/components/ExtractionStatus';
import VideoInfoCard from '@/components/VideoInfoCard';
import TranscriptResult from '@/components/TranscriptResult';
import ErrorMessage from '@/components/ErrorMessage';
import { useExtractStore } from '@/store/useExtractStore';

export default function Home() {
  const { status, result, error } = useExtractStore();

  return (
    <div className="relative min-h-screen">
      <div className="bg-glow" />
      <div className="bg-glow-2" />
      <Navbar />

      <main className="relative z-10 mx-auto max-w-[960px] px-4 pb-16 pt-28">
        <UrlInput />

        <div className="mt-8 flex flex-col gap-4">
          {status !== 'idle' && <ExtractionStatus />}
          {error && <ErrorMessage />}
          {result && (
            <>
              <VideoInfoCard result={result} />
              <TranscriptResult result={result} />
            </>
          )}
        </div>
      </main>

      <footer className="relative z-10 pb-8 text-center text-xs text-zinc-600">
        <p>视频文案提取器 · 仅供学习交流使用</p>
      </footer>
    </div>
  );
}
