-- Create enum types for the ERP system
CREATE TYPE public.order_status AS ENUM ('pending', 'confirmed', 'in_production', 'quality_check', 'completed', 'cancelled');
CREATE TYPE public.production_stage AS ENUM ('cutting', 'stitching', 'embroidery', 'packaging', 'completed');
CREATE TYPE public.quality_status AS ENUM ('pending', 'passed', 'failed', 'rework');
CREATE TYPE public.dispatch_status AS ENUM ('pending', 'packed', 'shipped', 'delivered');
CREATE TYPE public.user_role AS ENUM ('admin', 'sales', 'production', 'quality', 'dispatch', 'manager');
CREATE TYPE public.customer_tier AS ENUM ('bronze', 'silver', 'gold', 'platinum');

-- Create profiles table for user management
CREATE TABLE public.profiles (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'sales',
    phone TEXT,
    department TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create customers table
CREATE TABLE public.customers (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    company_name TEXT NOT NULL,
    contact_person TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    pincode TEXT,
    gstin TEXT,
    pan TEXT,
    customer_tier customer_tier DEFAULT 'bronze',
    credit_limit DECIMAL(12,2) DEFAULT 0,
    outstanding_amount DECIMAL(12,2) DEFAULT 0,
    total_orders INTEGER DEFAULT 0,
    last_order_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create products table
CREATE TABLE public.products (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    base_price DECIMAL(10,2) NOT NULL,
    cost_price DECIMAL(10,2),
    hsn_code TEXT,
    tax_rate DECIMAL(5,2) DEFAULT 18.00,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create orders table
CREATE TABLE public.orders (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    order_number TEXT UNIQUE NOT NULL,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    order_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    delivery_date TIMESTAMP WITH TIME ZONE,
    status order_status NOT NULL DEFAULT 'pending',
    total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    final_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    advance_amount DECIMAL(12,2) DEFAULT 0,
    balance_amount DECIMAL(12,2) DEFAULT 0,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create order_items table
CREATE TABLE public.order_items (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(12,2) NOT NULL,
    specifications JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create inventory table
CREATE TABLE public.inventory (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    item_name TEXT NOT NULL,
    item_code TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL,
    unit TEXT NOT NULL,
    current_stock DECIMAL(10,2) NOT NULL DEFAULT 0,
    minimum_stock DECIMAL(10,2) NOT NULL DEFAULT 0,
    maximum_stock DECIMAL(10,2),
    rate_per_unit DECIMAL(10,2) NOT NULL,
    supplier_name TEXT,
    supplier_contact TEXT,
    last_purchase_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create production_orders table
CREATE TABLE public.production_orders (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    production_number TEXT UNIQUE NOT NULL,
    stage production_stage NOT NULL DEFAULT 'cutting',
    assigned_to UUID REFERENCES auth.users(id),
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    estimated_hours INTEGER,
    actual_hours INTEGER,
    efficiency_percentage DECIMAL(5,2),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create quality_checks table
CREATE TABLE public.quality_checks (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    production_order_id UUID REFERENCES public.production_orders(id) ON DELETE CASCADE,
    check_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    checked_by UUID REFERENCES auth.users(id),
    status quality_status NOT NULL DEFAULT 'pending',
    defects_found TEXT[],
    pass_percentage DECIMAL(5,2),
    rework_required BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create dispatch_orders table
CREATE TABLE public.dispatch_orders (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    dispatch_number TEXT UNIQUE NOT NULL,
    dispatch_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    status dispatch_status NOT NULL DEFAULT 'pending',
    courier_name TEXT,
    tracking_number TEXT,
    delivery_address TEXT NOT NULL,
    estimated_delivery TIMESTAMP WITH TIME ZONE,
    actual_delivery TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_orders ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for authenticated users
CREATE POLICY "Users can view their own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can view all customers" ON public.customers
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage customers" ON public.customers
    FOR ALL TO authenticated USING (true);

CREATE POLICY "Authenticated users can view all products" ON public.products
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage products" ON public.products
    FOR ALL TO authenticated USING (true);

CREATE POLICY "Authenticated users can view all orders" ON public.orders
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage orders" ON public.orders
    FOR ALL TO authenticated USING (true);

CREATE POLICY "Authenticated users can view all order items" ON public.order_items
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage order items" ON public.order_items
    FOR ALL TO authenticated USING (true);

CREATE POLICY "Authenticated users can view all inventory" ON public.inventory
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage inventory" ON public.inventory
    FOR ALL TO authenticated USING (true);

CREATE POLICY "Authenticated users can view all production orders" ON public.production_orders
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage production orders" ON public.production_orders
    FOR ALL TO authenticated USING (true);

CREATE POLICY "Authenticated users can view all quality checks" ON public.quality_checks
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage quality checks" ON public.quality_checks
    FOR ALL TO authenticated USING (true);

CREATE POLICY "Authenticated users can view all dispatch orders" ON public.dispatch_orders
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage dispatch orders" ON public.dispatch_orders
    FOR ALL TO authenticated USING (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at columns
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON public.customers
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_inventory_updated_at
    BEFORE UPDATE ON public.inventory
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_production_orders_updated_at
    BEFORE UPDATE ON public.production_orders
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_dispatch_orders_updated_at
    BEFORE UPDATE ON public.dispatch_orders
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (user_id, full_name, email, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        NEW.email,
        'sales'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Create indexes for better performance
CREATE INDEX idx_customers_tier ON public.customers(customer_tier);
CREATE INDEX idx_customers_state ON public.customers(state);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_customer ON public.orders(customer_id);
CREATE INDEX idx_orders_date ON public.orders(order_date);
CREATE INDEX idx_production_orders_stage ON public.production_orders(stage);
CREATE INDEX idx_quality_checks_status ON public.quality_checks(status);
CREATE INDEX idx_dispatch_orders_status ON public.dispatch_orders(status);