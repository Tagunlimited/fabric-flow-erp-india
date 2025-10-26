import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';

interface SupplierTagProps {
  supplierName: string;
  onRemove?: () => void;
  className?: string;
  variant?: 'default' | 'secondary' | 'outline';
}

export function SupplierTag({ 
  supplierName, 
  onRemove, 
  className = '',
  variant = 'secondary'
}: SupplierTagProps) {
  return (
    <Badge 
      variant={variant} 
      className={`inline-flex items-center gap-1 ${className}`}
    >
      <span className="truncate max-w-32">{supplierName}</span>
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-1 hover:bg-black/10 rounded-full p-0.5 transition-colors"
          aria-label={`Remove ${supplierName}`}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </Badge>
  );
}
