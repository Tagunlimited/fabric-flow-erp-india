-- Insert sample departments for the application
-- This ensures the departments table has data for the calendar view and other components

-- Insert sample departments
INSERT INTO departments (name, description, is_active) VALUES
('Production', 'Manufacturing and production operations', true),
('Quality Control', 'Quality assurance and control processes', true),
('Sales', 'Sales and customer relationship management', true),
('Marketing', 'Marketing and promotional activities', true),
('HR', 'Human resources and personnel management', true),
('Finance', 'Financial management and accounting', true),
('IT', 'Information technology and systems support', true),
('Warehouse', 'Inventory and warehouse management', true),
('Cutting', 'Fabric cutting and preparation', true),
('Stitching', 'Garment stitching and assembly', true),
('Packaging', 'Product packaging and dispatch', true),
('Design', 'Product design and development', true),
('Maintenance', 'Equipment maintenance and repairs', true),
('Admin', 'Administrative and general operations', true),
('Security', 'Security and safety management', true)
ON CONFLICT (name) DO NOTHING;

-- Verify the departments were inserted
SELECT 'Sample departments inserted:' as info, COUNT(*) as total_departments FROM departments;

-- Show all departments
SELECT 'All departments:' as info, name, description, is_active FROM departments ORDER BY name;
