import { Badge } from '@/components/ui/badge';
import { CheckCircle, Clock, AlertCircle } from 'lucide-react';

interface BomItemStatusBadgeProps {
  totalOrdered: number;
  totalRequired: number;
  className?: string;
}

export function BomItemStatusBadge({ 
  totalOrdered, 
  totalRequired, 
  className = '' 
}: BomItemStatusBadgeProps) {
  const completionPercentage = totalRequired > 0 ? (totalOrdered / totalRequired) * 100 : 0;
  
  if (completionPercentage === 0) {
    return (
      <Badge variant="outline" className={`text-gray-600 border-gray-300 ${className}`}>
        <AlertCircle className="w-3 h-3 mr-1" />
        Not Ordered
      </Badge>
    );
  }
  
  if (completionPercentage === 100) {
    return (
      <Badge variant="default" className={`bg-green-600 hover:bg-green-700 text-white ${className}`}>
        <CheckCircle className="w-3 h-3 mr-1" />
        Complete
      </Badge>
    );
  }
  
  return (
    <Badge variant="secondary" className={`bg-orange-100 text-orange-800 border-orange-300 ${className}`}>
      <Clock className="w-3 h-3 mr-1" />
      Partial ({Math.round(completionPercentage)}%)
    </Badge>
  );
}
