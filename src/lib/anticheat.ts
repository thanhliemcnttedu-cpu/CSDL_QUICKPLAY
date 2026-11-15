// Chống gian lận phía học sinh.
// Trình duyệt KHÔNG thể ngăn tuyệt đối việc chụp màn hình bằng điện thoại hay mở ứng dụng khác.
// Cách làm: chặn được gì thì chặn (chuột phải, sao chép, phím tắt), còn lại thì PHÁT HIỆN dấu hiệu rời khỏi
// bài làm (chuyển tab, chuyển cửa sổ – gồm Snipping Tool/Win+Shift+S, ChatGPT, Google Lens –, thoát toàn màn hình,
// chia đôi màn hình) và báo ngay về bảng giám sát của giáo viên.
import { useEffect, useRef } from 'react';
import type { AntiCheatSettings, ViolationKind } from './types';

export const VIOLATION_LABELS: Record<ViolationKind, string> = {
  tab_hidden: 'Rời khỏi tab làm bài',
  window_blur: 'Chuyển sang cửa sổ/ứng dụng khác',
  exit_fullscreen: 'Thoát chế độ toàn màn hình',
  right_click: 'Bấm chuột phải',
  copy_paste: 'Sao chép / dán nội dung',
  screenshot_key: 'Bấm phím chụp màn hình',
  devtools: 'Mở công cụ nhà phát triển',
  shortcut: 'Dùng phím tắt bị cấm',
  split_screen: 'Thu nhỏ / chia đôi cửa sổ',
  open_link: 'Mở link tham khảo của đề (được phép)',
};

export const DEFAULT_ANTI_CHEAT: AntiCheatSettings = {
  enabled: false,
  block_right_click: true,
  block_copy: true,
  detect_leave: true,
  require_fullscreen: true,
  max_violations: 5,
};

/** Sự kiện để các nút "Mở link tham khảo" xin phép rời trang trong thời gian ngắn mà không bị tính vi phạm. */
export const ALLOW_LEAVE_EVENT = 'quizzi:allow-leave';
export const allowLeaveBriefly = () => window.dispatchEvent(new CustomEvent(ALLOW_LEAVE_EVENT));

export const fullscreenSupported = () => typeof document !== 'undefined' && !!document.documentElement.requestFullscreen;
export const isFullscreen = () => !!document.fullscreenElement;

export function enterFullscreen() {
  return document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
}

/**
 * Gắn bộ phát hiện khi `active` (đang làm bài). `report` được gọi mỗi khi có vi phạm.
 */
export function useAntiCheat(cfg: AntiCheatSettings | undefined, active: boolean, report: (kind: ViolationKind, detail: string) => void) {
  const cb = useRef(report);
  cb.current = report;
  const graceUntil = useRef(0);

  useEffect(() => {
    if (!cfg?.enabled || !active) return;
    const fire = (kind: ViolationKind, detail = '') => {
      if (Date.now() < graceUntil.current && kind !== 'open_link') return;
      cb.current(kind, detail);
    };
    const offs: (() => void)[] = [];
    const on = <K extends keyof WindowEventMap>(t: EventTarget, type: K | string, fn: (e: any) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn, opts);
      offs.push(() => t.removeEventListener(type, fn, opts));
    };

    on(window, ALLOW_LEAVE_EVENT, () => {
      graceUntil.current = Date.now() + 30000;
      cb.current('open_link', 'Học sinh mở link tham khảo đính kèm câu hỏi');
    });

    if (cfg.block_right_click) {
      on(document, 'contextmenu', (e: MouseEvent) => {
        e.preventDefault();
        fire('right_click', 'Bị chặn – có thể định dùng Google Lens / "Tìm bằng hình ảnh"');
      }, { capture: true });
    }

    if (cfg.block_copy) {
      for (const t of ['copy', 'cut', 'paste'] as const) {
        on(document, t, (e: ClipboardEvent) => {
          e.preventDefault();
          fire('copy_paste', t === 'paste' ? 'Dán nội dung từ bên ngoài' : 'Sao chép nội dung đề');
        }, { capture: true });
      }
      on(document, 'selectstart', (e: Event) => {
        const el = e.target as HTMLElement | null;
        if (!el?.closest?.('input, textarea')) e.preventDefault();
      }, { capture: true });
      on(document, 'dragstart', (e: DragEvent) => {
        // cho phép kéo thẻ đáp án, chặn kéo ảnh/chữ của đề ra ngoài
        const el = e.target as HTMLElement | null;
        if (!el?.closest?.('.dchip, .order-item')) e.preventDefault();
      }, { capture: true });
    }

    on(window, 'keydown', (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      if (e.key === 'F12' || (ctrl && e.shiftKey && ['i', 'j', 'c'].includes(k)) || (ctrl && k === 'u')) {
        e.preventDefault();
        fire('devtools', `Phím ${e.key === 'F12' ? 'F12' : `Ctrl+${e.shiftKey ? 'Shift+' : ''}${e.key.toUpperCase()}`}`);
        return;
      }
      if (cfg.block_copy && ctrl && ['c', 'x', 'v', 'p', 's'].includes(k) && !e.shiftKey) {
        e.preventDefault();
        fire(['c', 'x', 'v'].includes(k) ? 'copy_paste' : 'shortcut', `Phím Ctrl+${e.key.toUpperCase()}`);
        return;
      }
      if (e.key === 'PrintScreen') fire('screenshot_key', 'Phím Print Screen');
      if (ctrl && e.shiftKey && k === 's') fire('screenshot_key', 'Phím chụp vùng màn hình');
    }, { capture: true });

    on(window, 'keyup', (e: KeyboardEvent) => {
      // Windows chỉ phát PrintScreen ở keyup; cố xóa clipboard để ảnh chụp không dán được
      if (e.key === 'PrintScreen') {
        fire('screenshot_key', 'Phím Print Screen');
        navigator.clipboard?.writeText?.('').catch(() => {});
      }
    }, { capture: true });

    if (cfg.detect_leave) {
      on(document, 'visibilitychange', () => {
        if (document.visibilityState === 'hidden') fire('tab_hidden', 'Chuyển tab, thu nhỏ trình duyệt hoặc khóa màn hình');
      });
      on(window, 'blur', () => {
        // Bấm vào video YouTube (iframe) cũng làm mất focus cửa sổ – không tính là vi phạm
        setTimeout(() => {
          if (document.visibilityState === 'hidden') return; // đã tính ở visibilitychange
          if (document.activeElement?.tagName === 'IFRAME') return;
          fire('window_blur', 'Chuyển sang ứng dụng khác (Snipping Tool, ChatGPT, Google Lens, Zalo…)');
        }, 50);
      });
      const baseW = window.screen.availWidth;
      let lastSplit = 0;
      on(window, 'resize', () => {
        if (isFullscreen()) return;
        if (window.innerWidth < baseW * 0.6 && Date.now() - lastSplit > 10000) {
          lastSplit = Date.now();
          fire('split_screen', `Cửa sổ còn ${Math.round((window.innerWidth / baseW) * 100)}% chiều rộng màn hình`);
        }
      });
    }

    if (cfg.require_fullscreen) {
      on(document, 'fullscreenchange', () => {
        if (!document.fullscreenElement) fire('exit_fullscreen', 'Thoát chế độ toàn màn hình (Esc/F11)');
      });
    }

    on(window, 'beforeunload', (e: BeforeUnloadEvent) => {
      e.preventDefault();
    });

    document.body.classList.add('exam-lock');
    offs.push(() => document.body.classList.remove('exam-lock'));
    return () => offs.forEach((f) => f());
  }, [cfg, active]);
}
