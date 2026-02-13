import React from 'react';
import { ErpLayout } from '@/components/ErpLayout';
import { InventoryAdjustment } from '@/components/masters/InventoryAdjustment';
import { BackButton } from '@/components/common/BackButton';

const InventoryAdjustmentPage: React.FC = () => {
  return (
    <ErpLayout>
      <div className="space-y-6">
        <div className="flex items-center">
          <BackButton to="/inventory" label="Back to Inventory" />
        </div>
      <InventoryAdjustment />
      </div>
    </ErpLayout>
  );
};

export default InventoryAdjustmentPage;

