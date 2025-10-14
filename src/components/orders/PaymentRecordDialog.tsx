import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';

interface PaymentRecordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderNumber: string;
  balanceAmount: number;
  onPaymentRecorded: () => void;
}

export function PaymentRecordDialog({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  balanceAmount,
  onPaymentRecorded
}: PaymentRecordDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    payment_amount: '',
    payment_type: '',
    payment_reference: '',
    notes: ''
  });

  const paymentTypes = [
    'Cash',
    'Bank Transfer',
    'Cheque',
    'UPI',
    'Credit Card',
    'Debit Card',
    'Online Payment',
    'Other'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.payment_amount || !formData.payment_type) {
      toast.error('Please fill in all required fields');
      return;
    }

    const amount = parseFloat(formData.payment_amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid payment amount');
      return;
    }

    if (amount > balanceAmount) {
      toast.error('Payment amount cannot exceed the balance amount');
      return;
    }

    try {
      setLoading(true);

      // Log payment activity
      const { error: activityError } = await supabase.rpc('log_payment_activity', {
        p_order_id: orderId,
        p_payment_amount: amount,
        p_payment_type: formData.payment_type,
        p_payment_reference: formData.payment_reference || null,
        p_notes: formData.notes || null
      });

      if (activityError) throw activityError;

      // Update order advance amount
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          advance_amount: supabase.sql`advance_amount + ${amount}`,
          balance_amount: supabase.sql`balance_amount - ${amount}`
        })
        .eq('id', orderId);

      if (updateError) throw updateError;

      toast.success(`Payment of ${formatCurrency(amount)} recorded successfully`);
      onPaymentRecorded();
      onOpenChange(false);
      
      // Reset form
      setFormData({
        payment_amount: '',
        payment_type: '',
        payment_reference: '',
        notes: ''
      });

    } catch (error) {
      console.error('Error recording payment:', error);
      toast.error('Failed to record payment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Order Number</Label>
            <Input value={orderNumber} disabled className="bg-muted" />
          </div>

          <div className="space-y-2">
            <Label>Balance Amount</Label>
            <Input 
              value={formatCurrency(balanceAmount)} 
              disabled 
              className="bg-muted font-semibold" 
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment_amount">Payment Amount *</Label>
            <Input
              id="payment_amount"
              type="number"
              step="0.01"
              min="0"
              max={balanceAmount}
              value={formData.payment_amount}
              onChange={(e) => setFormData(prev => ({ ...prev, payment_amount: e.target.value }))}
              placeholder="Enter payment amount"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment_type">Payment Method *</Label>
            <Select 
              value={formData.payment_type} 
              onValueChange={(value) => setFormData(prev => ({ ...prev, payment_type: value }))}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select payment method" />
              </SelectTrigger>
              <SelectContent>
                {paymentTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment_reference">Payment Reference</Label>
            <Input
              id="payment_reference"
              value={formData.payment_reference}
              onChange={(e) => setFormData(prev => ({ ...prev, payment_reference: e.target.value }))}
              placeholder="Transaction ID, Cheque number, etc."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Additional notes about the payment"
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Recording...' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
