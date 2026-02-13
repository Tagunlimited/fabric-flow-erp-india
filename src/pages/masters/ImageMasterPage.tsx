import { ErpLayout } from "@/components/ErpLayout";
import { ImageMaster } from "@/components/masters/ImageMaster";
import { BackButton } from '@/components/common/BackButton';

const ImageMasterPage = () => {
  return (
    <ErpLayout fullPage>
      <div className="space-y-6">
        <div className="flex items-center">
          <BackButton to="/masters" label="Back to Masters" />
        </div>
        <ImageMaster />
      </div>
    </ErpLayout>
  );
};

export default ImageMasterPage;

