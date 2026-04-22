import { useNavigate, useParams } from 'react-router-dom';
import { ErpLayout } from '@/components/ErpLayout';
import { OrderForm } from '@/components/orders/OrderForm';

export default function ManualQuotationFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();

  return (
    <ErpLayout>
      <div className="space-y-6">
        <OrderForm
          mode="manualQuotation"
          manualQuotationId={id}
          onManualQuotationSaved={(manualQuotationId) => {
            navigate(`/accounts/manual-quotations/${manualQuotationId}`);
          }}
        />
      </div>
    </ErpLayout>
  );
}
