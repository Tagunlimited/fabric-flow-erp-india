import { Badge } from '@/components/ui/badge';

interface Color {
  colorId: string;
  colorName: string;
  hex: string;
}

interface CustomizationColorChipsProps {
  colors?: Array<Color>;
  className?: string;
}

export function CustomizationColorChips({ colors, className = '' }: CustomizationColorChipsProps) {
  if (!colors || colors.length === 0) {
    return null;
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {colors.map((color, index) => (
        <Badge 
          key={index}
          variant="outline"
          className="flex items-center gap-1.5 px-2 py-1"
        >
          <div 
            className="w-3 h-3 rounded-full border border-gray-300"
            style={{ backgroundColor: color.hex || '#FFFFFF' }}
          />
          <span className="text-xs">{color.colorName}</span>
        </Badge>
      ))}
    </div>
  );
}

