import { playSuccessNotificationSound } from '@/utils/notificationSounds';

/** Plays after a successful `orders.status` update (browser autoplay rules may block until user gesture). */
export function playOrderStatusChangeSound(): void {
  playSuccessNotificationSound();
}
