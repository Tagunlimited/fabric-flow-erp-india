import { fetchOrderItemsByOrderIds } from '@/lib/fetchOrderItemsBulk';
import { getOrderItemListThumbnailUrl } from '@/utils/orderItemImageUtils';

const ORDER_ITEM_THUMB_SELECT =
  'order_id, category_image_url, mockup_images, specifications';

export type OrderMetaForThumb = {
  order_type?: string | null;
};

/** Collect unique thumbnail URLs per order (one per distinct order line image). */
export async function collectOrderItemThumbnails(
  orderIds: string[],
  ordersMap?: Record<string, OrderMetaForThumb>
): Promise<Record<string, string[]>> {
  const imagesByOrder: Record<string, string[]> = {};
  const uniqueOrderIds = [...new Set(orderIds.filter(Boolean))];
  if (!uniqueOrderIds.length) return imagesByOrder;

  const { data: items } = await fetchOrderItemsByOrderIds(uniqueOrderIds, ORDER_ITEM_THUMB_SELECT);
  (items || []).forEach((it: any) => {
    const oid = it?.order_id;
    if (!oid) return;
    const thumb = getOrderItemListThumbnailUrl(it, {
      order_type: ordersMap?.[oid]?.order_type ?? undefined,
    });
    if (!thumb) return;
    if (!imagesByOrder[oid]) imagesByOrder[oid] = [];
    if (!imagesByOrder[oid].includes(thumb)) imagesByOrder[oid].push(thumb);
  });
  return imagesByOrder;
}

/** Merge BOM product_image_url as first thumbnail when present. */
export function mergeBomThumbnailsIntoMap(
  imagesByOrder: Record<string, string[]>,
  bomRows: Array<{ order_id?: string; product_image_url?: string | null }>
): Record<string, string[]> {
  const merged = { ...imagesByOrder };
  bomRows.forEach((b) => {
    const oid = b?.order_id;
    const url = b?.product_image_url;
    if (!oid || !url) return;
    const existing = merged[oid] || [];
    if (existing.includes(url)) return;
    merged[oid] = [url, ...existing];
  });
  return merged;
}

export function firstThumbnail(urls: string[] | undefined, fallback?: string): string | undefined {
  return urls?.[0] ?? fallback;
}
