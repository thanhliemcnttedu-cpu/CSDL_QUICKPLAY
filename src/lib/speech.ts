import { useCallback, useEffect, useRef, useState } from 'react';

// Web Speech API (Chrome/Edge). Nhận diện tiếng Việt & tiếng Anh theo thời gian thực.
type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

export const speechSupported = () =>
  typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

export type SpeechStatus = 'idle' | 'RECORDING' | 'error';

/**
 * Nút micro: onText nhận đoạn văn bản đã chốt (final). Tự ngắt sau 5 giây im lặng.
 */
export function useSpeech(onText: (t: string) => void, lang: 'vi-VN' | 'en-US' = 'vi-VN') {
  const [status, setStatus] = useState<SpeechStatus>('idle');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const rec = useRef<SR | null>(null);
  const silence = useRef<number>();
  const cb = useRef(onText);
  cb.current = onText;

  const stop = useCallback(() => {
    clearTimeout(silence.current);
    rec.current?.stop();
  }, []);

  const armSilence = useCallback(() => {
    clearTimeout(silence.current);
    silence.current = window.setTimeout(() => rec.current?.stop(), 5000);
  }, []);

  const start = useCallback(() => {
    setError('');
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) {
      setStatus('error');
      setError('Trình duyệt này không hỗ trợ nhập giọng nói. Hãy dùng Google Chrome hoặc Microsoft Edge.');
      return;
    }
    const r: SR = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e: any) => {
      let fin = '';
      let tmp = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) fin += t;
        else tmp += t;
      }
      setInterim(tmp);
      if (fin) cb.current(fin.trim());
      armSilence();
    };
    r.onerror = (e: any) => {
      setStatus('error');
      setError(
        e.error === 'not-allowed' || e.error === 'service-not-allowed'
          ? 'Trình duyệt đang chặn micro. Bấm biểu tượng ổ khóa cạnh thanh địa chỉ → Micrô → Cho phép, rồi thử lại.'
          : e.error === 'audio-capture'
            ? 'Không tìm thấy micro trên thiết bị. Hãy cắm micro hoặc tai nghe có micro.'
            : e.error === 'no-speech'
              ? 'Không nghe thấy tiếng nói. Hãy nói gần micro hơn.'
              : 'Lỗi nhận dạng giọng nói: ' + e.error,
      );
    };
    r.onend = () => {
      clearTimeout(silence.current);
      setInterim('');
      setStatus((s) => (s === 'error' ? s : 'idle'));
    };
    rec.current = r;
    try {
      r.start();
      setStatus('RECORDING');
      armSilence();
    } catch {
      setStatus('error');
      setError('Không khởi động được micro.');
    }
  }, [lang, armSilence]);

  useEffect(() => () => rec.current?.abort(), []);

  return { status, interim, error, start, stop, toggle: () => (status === 'RECORDING' ? stop() : start()) };
}
