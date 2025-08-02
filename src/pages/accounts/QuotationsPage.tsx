import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
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
    product_thumbnail: 'https://via.placeholder.com/40',
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
  },
];

export default function QuotationsPage() {
  const navigate = useNavigate();
  return (
    <ErpLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Quotations</h1>
          <p className="text-muted-foreground mt-1">View all quotations and their details</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>All Quotations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Quotation #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Sales Manager</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockQuotations.map((q) => (
                    <TableRow key={q.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/accounts/quotations/${q.id}`)}>
                      <TableCell><img src={q.product_thumbnail} alt="Product" className="h-10 w-10 rounded" /></TableCell>
                      <TableCell>{q.quotation_number}</TableCell>
                      <TableCell>{q.customer}</TableCell>
                      <TableCell>{q.date}</TableCell>
                      <TableCell><Badge>{q.status}</Badge></TableCell>
                      <TableCell>₹{q.amount.toLocaleString()}</TableCell>
                      <TableCell>{q.sales_manager}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </ErpLayout>
  );
} 