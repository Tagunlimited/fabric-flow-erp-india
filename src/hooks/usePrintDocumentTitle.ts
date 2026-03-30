import { useEffect, useRef } from 'react';

/**
 * While printing, browsers often show document.title in the print header (if headers are enabled).
 * Temporarily set a sensible title on beforeprint and restore after.
 *
 * Note: The page URL and other header/footer lines are controlled by the browser print dialog
 * (Chrome: disable "Headers and footers") — they cannot be removed via CSS.
 */
export function usePrintDocumentTitle(printTitle: string) {
  const savedTitle = useRef(document.title);

  useEffect(() => {
    const onBeforePrint = () => {
      savedTitle.current = document.title;
      document.title = printTitle;
    };
    const onAfterPrint = () => {
      document.title = savedTitle.current;
    };
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', onAfterPrint);
    };
  }, [printTitle]);
}
