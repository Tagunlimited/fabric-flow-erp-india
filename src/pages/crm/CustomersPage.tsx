import { ErpLayout } from "@/components/ErpLayout";
import { CustomerList } from "@/components/customers/CustomerList";

const CustomersPage = () => {
  return (
    <ErpLayout fullPage>
      <CustomerList />
    </ErpLayout>
  );
};

export default CustomersPage;