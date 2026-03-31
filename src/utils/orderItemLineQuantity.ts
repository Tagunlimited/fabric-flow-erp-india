export function getOrderItemLineQuantity(item: any): number {
  const normalize = (value: any): Record<string, number> => {
    const result: Record<string, number> = {};
    if (!value || typeof value !== 'object') return result;
    Object.entries(value).forEach(([size, qty]) => {
      const sizeName = String(size || '').trim();
      if (!sizeName) return;
      const quantity = Number(qty) || 0;
      if (quantity > 0) result[sizeName] = quantity;
    });
    return result;
  };

  let specs = item?.specifications;
  if (typeof specs === 'string') {
    try {
      specs = JSON.parse(specs);
    } catch {
      specs = null;
    }
  }

  const sizes = normalize(item?.sizes_quantities || specs?.sizes_quantities);
  const sum = Object.values(sizes).reduce((acc, qty) => acc + qty, 0);
  if (sum > 0) return sum;
  return Number(item?.quantity || 0);
}

export function getOrderTotalQuantityFromItems(items: any[]): number {
  if (!Array.isArray(items) || items.length === 0) return 0;
  return items.reduce((sum, item) => sum + getOrderItemLineQuantity(item), 0);
}

