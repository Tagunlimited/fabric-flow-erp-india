import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ErpLayout } from '@/components/ErpLayout';

const mockQuotations = [
  {
    id: 'q1',
    quotation_number: 'Q-2024-001',
    customer: 'Acme Corp',
    date: '2024-07-29',
    status: 'Draft',
    amount: 120000,
    sales_manager: 'John Doe',
    product_thumbnail: 'https://i.postimg.cc/P5ZMcQmn/polo-shirt.png',
    details: 'Product details and order breakdown here.'
  },
  {
    id: 'q2',
    quotation_number: 'Q-2024-002',
    customer: 'Beta Ltd',
    date: '2024-07-28',
    status: 'Sent',
    amount: 95000,
    sales_manager: 'Jane Smith',
    product_thumbnail: 'https://via.placeholder.com/40',
    details: 'Product details and order breakdown here.'
  },
];

export default function QuotationDetailPage() {
  const { id } = useParams();
  const quotation = mockQuotations.find(q => q.id === id);
  if (!quotation) return <div>Quotation not found</div>;
  return (
    <ErpLayout>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Quotation #{quotation.quotation_number}</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline">Print Quotation</Button>
                <Button variant="outline">Export Quotation</Button>
                <Button variant="outline">Record Receipt</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-6 items-center mb-4">
              <img src={quotation.product_thumbnail} alt="Product" className="h-16 w-16 rounded" />
              <div>
                <div className="font-bold text-lg">{quotation.customer}</div>
                <div className="text-muted-foreground">Sales Manager: {quotation.sales_manager}</div>
                <div className="text-muted-foreground">Date: {quotation.date}</div>
                <div className="text-muted-foreground">Status: {quotation.status}</div>
                <div className="text-muted-foreground">Amount: ₹{quotation.amount.toLocaleString()}</div>
              </div>
            </div>
            <div className="mt-4">
              <h2 className="font-semibold mb-2">Order Details</h2>
              <div>{quotation.details}</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ErpLayout>
  );
} 