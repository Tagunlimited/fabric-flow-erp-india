import { supabase } from '@/integrations/supabase/client';

export interface BestSupplier {
  supplier_id: string;
  supplier_code: string;
  supplier_name: string;
  primary_contact_phone: string | null;
  primary_contact_email: string | null;
  total_outstanding_amount: number | null;
  priority: number | null;
  credit_limit: number | null;
}

/**
 * Get the best suppliers for a given item/product/fabric
 */
export async function getBestSuppliers(
  specializationType: 'fabric' | 'item' | 'product',
  specializationId: string,
  limit: number = 5
): Promise<BestSupplier[]> {
  try {
    const { data, error } = await supabase.rpc('get_best_suppliers', {
      p_specialization_type: specializationType,
      p_specialization_id: specializationId,
      p_limit: limit
    });

    if (error) {
      console.error('Error getting best suppliers:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error calling get_best_suppliers:', error);
    return [];
  }
}

/**
 * Get all suppliers with their specializations
 */
export async function getSuppliersWithSpecializations() {
  try {
    const { data: suppliers, error: suppliersError } = await supabase
      .from('supplier_master')
      .select('*')
      .eq('enabled', true)
      .order('supplier_name');

    if (suppliersError) throw suppliersError;

    const { data: specializations, error: specsError } = await supabase
      .from('supplier_specializations')
      .select('*')
      .order('priority', { ascending: false });

    if (specsError) throw specsError;

    // Group specializations by supplier
    const specsBySupplier = specializations?.reduce((acc, spec) => {
      if (!acc[spec.supplier_id]) {
        acc[spec.supplier_id] = [];
      }
      acc[spec.supplier_id].push(spec);
      return acc;
    }, {} as Record<string, any[]>) || {};

    return suppliers?.map(supplier => ({
      ...supplier,
      specializations: specsBySupplier[supplier.id] || []
    })) || [];
  } catch (error) {
    console.error('Error fetching suppliers with specializations:', error);
    return [];
  }
}

/**
 * Update supplier outstanding amount
 */
export async function updateSupplierOutstandingAmount(
  supplierId: string,
  amount: number
) {
  try {
    const { error } = await supabase
      .from('supplier_master')
      .update({ total_outstanding_amount: amount })
      .eq('id', supplierId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error updating supplier outstanding amount:', error);
    return false;
  }
}

/**
 * Add supplier specialization
 */
export async function addSupplierSpecialization(
  supplierId: string,
  specializationType: 'fabric' | 'item' | 'product',
  specializationId: string,
  specializationName: string,
  priority: number = 1
) {
  try {
    const { error } = await supabase
      .from('supplier_specializations')
      .insert({
        supplier_id: supplierId,
        specialization_type: specializationType,
        specialization_id: specializationId,
        specialization_name: specializationName,
        priority
      });

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error adding supplier specialization:', error);
    return false;
  }
}

/**
 * Remove supplier specialization
 */
export async function removeSupplierSpecialization(specializationId: string) {
  try {
    const { error } = await supabase
      .from('supplier_specializations')
      .delete()
      .eq('id', specializationId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error removing supplier specialization:', error);
    return false;
  }
}

/**
 * Get suppliers by specialization type
 */
export async function getSuppliersBySpecializationType(
  specializationType: 'fabric' | 'item' | 'product'
) {
  try {
    const { data, error } = await supabase
      .from('supplier_specializations')
      .select(`
        *,
        supplier_master (
          id,
          supplier_code,
          supplier_name,
          primary_contact_phone,
          primary_contact_email,
          total_outstanding_amount,
          credit_limit
        )
      `)
      .eq('specialization_type', specializationType)
      .order('priority', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching suppliers by specialization type:', error);
    return [];
  }
}
