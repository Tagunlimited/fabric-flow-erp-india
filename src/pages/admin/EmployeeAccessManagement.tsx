import { ErpLayout } from "@/components/ErpLayout";
import { EmployeeAccessManagement } from "@/components/admin/EmployeeAccessManagement";

const EmployeeAccessManagementPage = () => {
  return (
    <ErpLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Employee Access Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Create user accounts for employees and manage their sidebar permissions
          </p>
        </div>
        <EmployeeAccessManagement />
      </div>
    </ErpLayout>
  );
};

export default EmployeeAccessManagementPage;


