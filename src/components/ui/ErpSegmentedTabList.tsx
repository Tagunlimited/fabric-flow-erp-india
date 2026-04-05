import * as React from "react";
import { TabsList } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import "@/components/purchase-orders/POPlanningSegmentedSwitch.css";

export type ErpSegmentedTabListProps = React.ComponentPropsWithoutRef<typeof TabsList> & {
  segmentCount: number;
  activeIndex: number;
  stretch?: boolean;
};

const ErpSegmentedTabList = React.forwardRef<
  React.ElementRef<typeof TabsList>,
  ErpSegmentedTabListProps
>(({ className, segmentCount, activeIndex, stretch = true, children, ...props }, ref) => {
  const safeCount = Math.max(1, segmentCount);
  const safeIdx = Math.min(Math.max(0, activeIndex), safeCount - 1);

  return (
    <TabsList
      ref={ref}
      className={cn(
        "erp-segmented !h-auto !min-h-0 !rounded-[9999px] !p-0 !text-white",
        stretch && "erp-segmented--stretch",
        className
      )}
      style={
        {
          "--seg-count": safeCount,
          "--seg-active": safeIdx,
        } as React.CSSProperties
      }
      {...props}
    >
      <span className="erp-segmented__thumb" aria-hidden />
      {children}
    </TabsList>
  );
});
ErpSegmentedTabList.displayName = "ErpSegmentedTabList";

export { ErpSegmentedTabList };
