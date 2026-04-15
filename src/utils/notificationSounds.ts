import { toast } from 'sonner';

const SUCCESS_SOUND_SRC = '/success.mp3';
const ERROR_SOUND_SRC = '/error.mp3';
const NOTIFICATION_SOUND_MAX_DURATION_SEC = 6;

let successAudio: HTMLAudioElement | null = null;
let errorAudio: HTMLAudioElement | null = null;
let successStopTimer: ReturnType<typeof setTimeout> | null = null;
let errorStopTimer: ReturnType<typeof setTimeout> | null = null;
let toastSoundHooksInstalled = false;

function clearTimer(timer: ReturnType<typeof setTimeout> | null): null {
  if (timer !== null) clearTimeout(timer);
  return null;
}

function getAudio(kind: 'success' | 'error'): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (kind === 'success') {
    if (!successAudio) {
      successAudio = new Audio(SUCCESS_SOUND_SRC);
      successAudio.preload = 'auto';
    }
    return successAudio;
  }

  if (!errorAudio) {
    errorAudio = new Audio(ERROR_SOUND_SRC);
    errorAudio.preload = 'auto';
  }
  return errorAudio;
}

function play(kind: 'success' | 'error'): void {
  try {
    const a = getAudio(kind);
    if (!a) return;

    if (kind === 'success') {
      successStopTimer = clearTimer(successStopTimer);
    } else {
      errorStopTimer = clearTimer(errorStopTimer);
    }

    a.currentTime = 0;
    void a.play().then(() => {
      const timeoutId = window.setTimeout(() => {
        try {
          a.pause();
          a.currentTime = 0;
        } catch {
          // ignore
        }
      }, NOTIFICATION_SOUND_MAX_DURATION_SEC * 1000);

      if (kind === 'success') {
        successStopTimer = timeoutId;
      } else {
        errorStopTimer = timeoutId;
      }
    }).catch(() => {
      // autoplay policy or missing asset; ignore
    });
  } catch {
    // ignore
  }
}

export function playSuccessNotificationSound(): void {
  play('success');
}

export function playErrorNotificationSound(): void {
  play('error');
}

export function playSoundForNotificationType(type: 'info' | 'success' | 'warning' | 'error'): void {
  if (type === 'error' || type === 'warning') {
    playErrorNotificationSound();
    return;
  }
  playSuccessNotificationSound();
}

/**
 * Install once at app startup so all sonner toasts
 * automatically play success/error sounds everywhere.
 */
export function installGlobalToastSoundEffects(): void {
  if (toastSoundHooksInstalled) return;
  toastSoundHooksInstalled = true;

  const t = toast as any;
  const originalSuccess = t.success?.bind(t);
  const originalError = t.error?.bind(t);
  const originalWarning = (t.warning || t.warn)?.bind(t);

  if (originalSuccess) {
    t.success = (...args: any[]) => {
      playSuccessNotificationSound();
      return originalSuccess(...args);
    };
  }

  if (originalError) {
    t.error = (...args: any[]) => {
      playErrorNotificationSound();
      return originalError(...args);
    };
  }

  if (originalWarning) {
    const warningWrapper = (...args: any[]) => {
      playErrorNotificationSound();
      return originalWarning(...args);
    };
    if (t.warning) t.warning = warningWrapper;
    if (t.warn) t.warn = warningWrapper;
  }
}
