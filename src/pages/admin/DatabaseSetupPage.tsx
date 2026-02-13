import { ErpLayout } from "@/components/ErpLayout";
import { DatabaseInitializer } from "@/components/DatabaseInitializer";
import { BackButton } from '@/components/common/BackButton';

const DatabaseSetupPage = () => {
  return (
    <ErpLayout>
      <div className="container mx-auto py-8">
        <div className="mb-4">
          <BackButton to="/configuration" label="Back to Configuration" />
        </div>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">
            Database Setup
          </h1>
          <p className="text-muted-foreground">
            Initialize and manage your database with sample data for development and testing.
          </p>
        </div>
        
        <DatabaseInitializer />
      </div>
    </ErpLayout>
  );
};

export default DatabaseSetupPage; 