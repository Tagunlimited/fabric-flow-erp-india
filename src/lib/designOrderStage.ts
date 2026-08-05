import { getOrderItemDisplayImage, firstOrderImageUrlFromArray } from '@/utils/orderItemImageUtils';

/** Minimal order shape for design-stage checks (Designs + Printing queues). */
export interface DesignStageOrder {
  id: string;
  order_type?: string;
  order_items?: Array<{
    id: string;
    specifications: unknown;
    mockup_images?: string[];
    category_image_url?: string | null;
  }>;
}

export function getOrderMockupPreviewUrls(order: DesignStageOrder): string[] {
  if (!order.order_items || order.order_items.length === 0) return [];
  const seen = new Set<string>();
  const urls: string[] = [];

  order.order_items.forEach((item: any) => {
    const displayImage = getOrderItemDisplayImage(item, order);
    const normalized = (displayImage || '').trim();
    if (!normalized) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    urls.push(normalized);
  });

  return urls;
}

export function hasMockup(order: DesignStageOrder): boolean {
  if (getOrderMockupPreviewUrls(order).length > 0) return true;
  if (!order.order_items || order.order_items.length === 0) return false;

  return order.order_items.some((item: any) => {
    if (firstOrderImageUrlFromArray(item.mockup_images)) return true;

    try {
      const specs =
        typeof item.specifications === 'string'
          ? JSON.parse(item.specifications)
          : item.specifications || {};

      return !!firstOrderImageUrlFromArray(specs.mockup_images);
    } catch {
      return false;
    }
  });
}

export function hasBranding(order: DesignStageOrder): boolean {
  if (!order.order_items || order.order_items.length === 0) return false;

  return order.order_items.some((item: any) => {
    try {
      const specs =
        typeof item.specifications === 'string'
          ? JSON.parse(item.specifications)
          : item.specifications || {};

      const brandingItems = specs.branding_items || [];

      if (!Array.isArray(brandingItems) || brandingItems.length === 0) {
        return false;
      }

      return brandingItems.some((branding: any) => {
        return (
          branding &&
          typeof branding === 'object' &&
          branding.branding_type &&
          branding.branding_type.trim() !== ''
        );
      });
    } catch {
      return false;
    }
  });
}

/** True when Designs tab would list this order under Completed (mockup or branding done per order type). */
export function isDesignWorkComplete(order: DesignStageOrder): boolean {
  let isReadymade = order.order_type === 'readymade';

  if (!isReadymade && order.order_items && order.order_items.length > 0) {
    const firstItem = order.order_items[0];
    try {
      const specs =
        typeof firstItem.specifications === 'string'
          ? JSON.parse(firstItem.specifications)
          : firstItem.specifications || {};
      isReadymade = specs.order_type === 'readymade';
    } catch {
      // ignore
    }
  }

  if (isReadymade) {
    return hasBranding(order);
  }
  return hasMockup(order);
}

export function getDesignOrderStatusColor(status: string): string {
  switch (status) {
    case 'pending':
      return 'bg-yellow-100 text-yellow-800';
    case 'confirmed':
      return 'bg-blue-100 text-blue-800';
    case 'in_production':
      return 'bg-purple-100 text-purple-800';
    case 'completed':
      return 'bg-green-100 text-green-800';
    case 'cancelled':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}
