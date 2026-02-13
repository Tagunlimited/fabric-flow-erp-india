-- Fix Order Lifecycle Functions (Run this after the simple view)
-- This creates the logging functions and triggers

-- Create function to log order activities
CREATE OR REPLACE FUNCTION log_order_activity(
    p_order_id UUID,
    p_activity_type TEXT,
    p_activity_description TEXT,
    p_metadata JSONB DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO order_activities (
        order_id,
        activity_type,
        activity_description,
        metadata,
        performed_by
    ) VALUES (
        p_order_id,
        p_activity_type,
        p_activity_description,
        p_metadata,
        auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to manually log custom activities
CREATE OR REPLACE FUNCTION log_custom_order_activity(
    p_order_id UUID,
    p_activity_type TEXT,
    p_activity_description TEXT,
    p_metadata JSONB DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    PERFORM log_order_activity(
        p_order_id,
        p_activity_type,
        p_activity_description,
        p_metadata
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to log payment activities
CREATE OR REPLACE FUNCTION log_payment_activity(
    p_order_id UUID,
    p_payment_amount DECIMAL(10,2),
    p_payment_type VARCHAR(50),
    p_payment_reference VARCHAR(100),
    p_notes TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    PERFORM log_order_activity(
        p_order_id,
        'payment_received',
        format('Payment received: %s via %s', p_payment_amount, p_payment_type),
        jsonb_build_object(
            'payment_amount', p_payment_amount,
            'payment_type', p_payment_type,
            'payment_reference', p_payment_reference,
            'notes', p_notes
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
