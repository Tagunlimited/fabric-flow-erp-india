import React from 'react';
import { ErpLayout } from '@/components/ErpLayout';
import { InventoryAdjustment } from '@/components/masters/InventoryAdjustment';

const InventoryAdjustmentPage: React.FC = () => {
  return (
    <ErpLayout>
      <InventoryAdjustment />
    </ErpLayout>
  );
};

export default InventoryAdjustmentPage;

