import { ErpLayout } from "@/components/ErpLayout";
import ProductCategories from "./ProductCategories";
import { BackButton } from '@/components/common/BackButton';

const ProductCategoriesPage = () => {
  return (
    <ErpLayout fullPage>
      <div className="space-y-6">
        <div className="flex items-center">
          <BackButton to="/inventory" label="Back to Inventory" />
        </div>
        <ProductCategories />
      </div>
    </ErpLayout>
  );
};

export default ProductCategoriesPage;