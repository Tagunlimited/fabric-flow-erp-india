import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { TableHead } from '@/components/ui/table';

interface SortableTableHeaderProps {
  label: string;
  field: string;
  currentSortField: string;
  currentSortDirection: 'asc' | 'desc';
  onSort: (field: string) => void;
  className?: string;
}

export function SortableTableHeader({
  label,
  field,
  currentSortField,
  currentSortDirection,
  onSort,
  className = ''
}: SortableTableHeaderProps) {
  const isActive = currentSortField === field;
  
  return (
    <TableHead 
      className={`cursor-pointer hover:bg-muted/50 transition-colors select-none ${className}`}
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
        {isActive ? (
          currentSortDirection === 'asc' ? (
            <ArrowUp className="w-4 h-4" />
          ) : (
            <ArrowDown className="w-4 h-4" />
          )
        ) : (
          <ArrowUpDown className="w-4 h-4 opacity-30" />
        )}
      </div>
    </TableHead>
  );
}

