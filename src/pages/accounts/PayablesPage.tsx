import { ErpLayout } from "@/components/ErpLayout";

export default function PayablesPage() {
  return (
    <ErpLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Payables
          </h1>
          <p className="mt-1 text-muted-foreground">Outgoing payments and vendor balances</p>
        </div>
      </div>
    </ErpLayout>
  );
}
