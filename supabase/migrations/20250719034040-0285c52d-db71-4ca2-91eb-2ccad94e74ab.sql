-- Create sequence for employee codes first
CREATE SEQUENCE IF NOT EXISTS employees_seq START 1;

-- Create employees table with all required fields
CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code text UNIQUE NOT NULL DEFAULT CONCAT('EMP', LPAD(NEXTVAL('employees_seq')::text, 4, '0')),
  
  -- Personal Details
  full_name text NOT NULL,
  date_of_birth date NOT NULL,
  gender text NOT NULL CHECK (gender IN ('Male', 'Female', 'Other')),
  marital_status text CHECK (marital_status IN ('Single', 'Married', 'Divorced', 'Widowed')),
  blood_group text CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  
  -- Contact Details  
  personal_email text,
  personal_phone text NOT NULL,
  emergency_contact_name text NOT NULL,
  emergency_contact_phone text NOT NULL,
  
  -- Address
  address_line1 text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  pincode text NOT NULL,
  
  -- Employment Details
  designation text NOT NULL,
  department text NOT NULL,
  joining_date date NOT NULL,
  employment_type text NOT NULL CHECK (employment_type IN ('Full-time', 'Part-time', 'Contract', 'Intern')),
  reports_to uuid REFERENCES employees(id),
  
  -- System fields
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  
  -- Add constraint to ensure employee is at least 18 years old
  CONSTRAINT check_age CHECK (date_of_birth <= CURRENT_DATE - INTERVAL '18 years')
);

-- Enable RLS
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- Create policies for employees table
CREATE POLICY "Authenticated users can view all employees"
  ON employees
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage employees"
  ON employees
  FOR ALL
  TO authenticated
  USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_employees_department ON employees(department);
CREATE INDEX idx_employees_designation ON employees(designation);
CREATE INDEX idx_employees_reports_to ON employees(reports_to);
CREATE INDEX idx_employees_employee_code ON employees(employee_code);

-- Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text UNIQUE NOT NULL,
  order_id uuid REFERENCES orders(id),
  customer_id uuid REFERENCES customers(id) NOT NULL,
  
  -- Invoice details
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL,
  
  -- Amounts
  subtotal numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  paid_amount numeric DEFAULT 0,
  balance_amount numeric GENERATED ALWAYS AS (total_amount - COALESCE(paid_amount, 0)) STORED,
  
  -- Status
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  
  -- Additional details
  notes text,
  terms_and_conditions text,
  
  -- System fields
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid
);

-- Enable RLS for invoices
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Create policies for invoices
CREATE POLICY "Authenticated users can view all invoices"
  ON invoices
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage invoices"
  ON invoices
  FOR ALL
  TO authenticated
  USING (true);

-- Create trigger for invoices timestamp updates
CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create invoice_items table
CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES invoices(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES products(id),
  
  -- Item details
  description text NOT NULL,
  quantity numeric NOT NULL,
  unit_price numeric NOT NULL,
  total_price numeric GENERATED ALWAYS AS (quantity * unit_price) STORED,
  
  created_at timestamptz DEFAULT now()
);

-- Enable RLS for invoice_items
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

-- Create policies for invoice_items
CREATE POLICY "Authenticated users can view all invoice items"
  ON invoice_items
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage invoice items"
  ON invoice_items
  FOR ALL
  TO authenticated
  USING (true);

-- Create indexes for invoices
CREATE INDEX idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX idx_invoices_order_id ON invoices(order_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_date ON invoices(invoice_date);
CREATE INDEX idx_invoice_items_invoice_id ON invoice_items(invoice_id);