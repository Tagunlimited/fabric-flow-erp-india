import { ErpLayout } from "@/components/ErpLayout";
import { ProductionTeamList } from "@/components/people/ProductionTeamList";

const ProductionTeamPage = () => {
  return (
    <ErpLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Production Team
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage cutting managers and tailors
          </p>
        </div>
        <ProductionTeamList />
      </div>
    </ErpLayout>
  );
};

export default ProductionTeamPage;
