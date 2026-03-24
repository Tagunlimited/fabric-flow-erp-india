import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

/**
 * Legacy route `/bom/create` — redirects to product-level BOM editor (`/bom/new`).
 */
export function BomCreator() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const orderId = searchParams.get('orderId');
    const orderItemId = searchParams.get('orderItemId');
    if (orderId && orderItemId) {
      navigate(
        `/bom/new?order=${encodeURIComponent(orderId)}&orderItemId=${encodeURIComponent(orderItemId)}`,
        { replace: true }
      );
    } else if (orderId) {
      navigate(`/bom/new?order=${encodeURIComponent(orderId)}`, { replace: true });
    } else {
      navigate('/bom/new', { replace: true });
    }
  }, [navigate, searchParams]);

  return (
    <div className="flex items-center justify-center min-h-[240px] text-muted-foreground text-sm">
      Redirecting to BOM form…
    </div>
  );
}
