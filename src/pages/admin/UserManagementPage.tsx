import { ErpLayout } from "@/components/ErpLayout";
import { UserManagement } from "@/components/admin/UserManagement";
import { BackButton } from '@/components/common/BackButton';

const UserManagementPage = () => {
  return (
    <ErpLayout>
      <div className="space-y-6">
        <div className="flex items-center">
          <BackButton to="/configuration" label="Back to Configuration" />
        </div>
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            User Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage user registrations, approvals, and role assignments
          </p>
        </div>
        <UserManagement />
      </div>
    </ErpLayout>
  );
};

export default UserManagementPage;