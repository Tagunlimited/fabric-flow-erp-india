import { Progress } from '@/components/ui/progress';

interface QuantityProgressProps {
  ordered: number;
  total: number;
  className?: string;
  showNumbers?: boolean;
}

export function QuantityProgress({ 
  ordered, 
  total, 
  className = '',
  showNumbers = true 
}: QuantityProgressProps) {
  const percentage = total > 0 ? (ordered / total) * 100 : 0;
  const remaining = total - ordered;

  return (
    <div className={`space-y-2 ${className}`}>
      {showNumbers && (
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Ordered: {ordered}</span>
          <span>Remaining: {remaining}</span>
        </div>
      )}
      <Progress 
        value={percentage} 
        className="h-2"
        // Custom color based on completion
        style={{
          '--progress-background': percentage === 100 ? '#10b981' : percentage > 0 ? '#f59e0b' : '#e5e7eb'
        } as React.CSSProperties}
      />
      {showNumbers && (
        <div className="text-xs text-center text-muted-foreground">
          {Math.round(percentage)}% complete
        </div>
      )}
    </div>
  );
}
