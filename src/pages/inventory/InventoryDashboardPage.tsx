import React, { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ErpLayout } from '@/components/ErpLayout';
import { BackButton } from '@/components/common/BackButton';
import { cn } from '@/lib/utils';
import '@/pages/OrdersPageViewSwitch.css';
import WarehouseInventoryPage from '@/pages/warehouse/WarehouseInventoryPage';
import ProductInventoryPage from '@/pages/inventory/ProductInventoryPage';

type InventoryDashboardTab = 'raw' | 'product';

const InventoryDashboardPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const tab: InventoryDashboardTab = useMemo(() => {
    const t = (searchParams.get('tab') || '').toLowerCase();
    return t === 'product' ? 'product' : 'raw';
  }, [searchParams]);

  const setTab = useCallback(
    (next: InventoryDashboardTab) => {
      if (next === 'raw') {
        setSearchParams({}, { replace: true });
      } else {
        setSearchParams({ tab: 'product' }, { replace: true });
      }
    },
    [setSearchParams]
  );

  return (
    <ErpLayout>
      <div className="w-full space-y-6 bg-[#f9fafb] p-6 -mx-4 sm:-mx-6 rounded-xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <BackButton to="/inventory" label="Back to Inventory" />
        </div>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-[30px] font-bold leading-9 tracking-tight text-[#101828]">
              Inventory Dashboard
            </h1>
          </div>

          <div
            className="orders-view-switch shrink-0"
            role="tablist"
            aria-label="Inventory type"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'raw'}
              className={cn('orders-view-switch-tab', tab === 'raw' && 'is-active')}
              onClick={() => setTab('raw')}
            >
              Raw Material
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'product'}
              className={cn('orders-view-switch-tab', tab === 'product' && 'is-active')}
              onClick={() => setTab('product')}
            >
              Product
            </button>
          </div>
        </div>

        <div className="min-w-0">
          {tab === 'raw' && <WarehouseInventoryPage embedded />}
          {tab === 'product' && <ProductInventoryPage embedded />}
        </div>
      </div>
    </ErpLayout>
  );
};

export default InventoryDashboardPage;
