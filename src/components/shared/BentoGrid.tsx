import { cn } from '@/lib/utils';

export function BentoGrid({
  children, className, cols = 4,
}: { children: React.ReactNode; className?: string; cols?: 2 | 3 | 4 }) {
  const colsClass = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-2 lg:grid-cols-3',
    4: 'md:grid-cols-2 lg:grid-cols-4',
  }[cols];

  return (
    <div className={cn('grid grid-cols-1 gap-6', colsClass, className)}>
      {children}
    </div>
  );
}

export function BentoCard({
  children, className, colSpan = 1, rowSpan = 1,
}: {
  children: React.ReactNode; className?: string;
  colSpan?: 1 | 2; rowSpan?: 1 | 2;
}) {
  return (
    <div className={cn(
      colSpan === 2 && 'md:col-span-2',
      rowSpan === 2 && 'md:row-span-2',
      className,
    )}>
      {children}
    </div>
  );
}
