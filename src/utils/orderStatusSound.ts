/** Public asset: scissors sound on order status change */
const ORDER_STATUS_SOUND_SRC = '/freesound_community-scissors-69248.mp3';

/** Cap playback so long clips do not keep playing (seconds). */
const NOTIFICATION_SOUND_MAX_DURATION_SEC = 6;

let sharedAudio: HTMLAudioElement | null = null;
let stopAfterMsTimeoutId: ReturnType<typeof setTimeout> | null = null;

function getAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (!sharedAudio) {
    sharedAudio = new Audio(ORDER_STATUS_SOUND_SRC);
    sharedAudio.preload = 'auto';
  }
  return sharedAudio;
}

function clearStopTimer(): void {
  if (stopAfterMsTimeoutId !== null) {
    clearTimeout(stopAfterMsTimeoutId);
    stopAfterMsTimeoutId = null;
  }
}

/** Plays after a successful `orders.status` update (browser autoplay rules may block until user gesture). */
export function playOrderStatusChangeSound(): void {
  try {
    const a = getAudio();
    if (!a) return;
    clearStopTimer();
    a.currentTime = 0;
    void a
      .play()
      .then(() => {
        stopAfterMsTimeoutId = window.setTimeout(() => {
          stopAfterMsTimeoutId = null;
          try {
            a.pause();
            a.currentTime = 0;
          } catch {
            /* ignore */
          }
        }, NOTIFICATION_SOUND_MAX_DURATION_SEC * 1000);
      })
      .catch(() => {
        /* Missing file, autoplay policy, or decode error — ignore */
      });
  } catch {
    /* ignore */
  }
}
