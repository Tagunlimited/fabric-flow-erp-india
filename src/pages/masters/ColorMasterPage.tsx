import { ErpLayout } from "@/components/ErpLayout";
import ColorMaster from "@/components/masters/ColorMaster";

const ColorMasterPage = () => {
  return (
    <ErpLayout fullPage>
      <div className="w-full h-full p-6">
        <ColorMaster />
      </div>
    </ErpLayout>
  );
};

export default ColorMasterPage;

