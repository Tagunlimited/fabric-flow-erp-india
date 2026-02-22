import './StarBorder.css';

interface StarBorderProps {
  as?: keyof JSX.IntrinsicElements;
  className?: string;
  color?: string;
  bgColor?: string;
  textColor?: string;
  speed?: string;
  thickness?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: () => void;
  [key: string]: any;
}

const StarBorder = ({
  as: Component = 'button',
  className = '',
  color = 'white',
  bgColor,
  textColor,
  speed = '6s',
  thickness = 1,
  children,
  style,
  ...rest
}: StarBorderProps) => {
  return (
    <Component
      className={`star-border-container ${className}`}
      style={{
        padding: `${thickness}px 0`,
        ...style
      }}
      {...rest}
    >
      <div
        className="border-gradient-bottom"
        style={{
          background: `radial-gradient(circle, ${color}, transparent 10%)`,
          animationDuration: speed
        }}
      ></div>
      <div
        className="border-gradient-top"
        style={{
          background: `radial-gradient(circle, ${color}, transparent 10%)`,
          animationDuration: speed
        }}
      ></div>
      <div 
        className="inner-content"
        style={{
          background: bgColor || undefined,
          color: textColor || undefined
        }}
      >
        {children}
      </div>
    </Component>
  );
};

export default StarBorder;
