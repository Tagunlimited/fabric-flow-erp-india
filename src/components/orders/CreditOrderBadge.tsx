import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const creditTagClass =
  'border-red-600 bg-red-50 text-red-600 font-bold text-base leading-tight px-2.5 py-0.5 shadow-none hover:bg-red-50';

type CreditOrderBadgeProps = React.ComponentProps<typeof Badge>;

export function CreditOrderBadge({ className, children = 'Credit', ...props }: CreditOrderBadgeProps) {
  return (
    <Badge variant="outline" className={cn(creditTagClass, className)} {...props}>
      {children}
    </Badge>
  );
}
