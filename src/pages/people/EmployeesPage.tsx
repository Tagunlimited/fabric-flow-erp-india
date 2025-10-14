import { ErpLayout } from "@/components/ErpLayout";
import { EmployeeList } from "@/components/people/EmployeeList";

const EmployeesPage = () => {
  return (
    <ErpLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Our People
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage employee directory, profiles, and organizational structure
          </p>
        </div>
        <EmployeeList />
      </div>
    </ErpLayout>
  );
};

export default EmployeesPage;