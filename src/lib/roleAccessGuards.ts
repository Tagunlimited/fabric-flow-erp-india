export type MinimalProfile = {
  role?: string | null;
};

export function resolveProfileAfterRefresh(
  currentProfile: MinimalProfile | null,
  fetchedProfile: MinimalProfile | null
): MinimalProfile | null {
  if (fetchedProfile) return fetchedProfile;
  return currentProfile;
}

export function canEditOrderAction(params: {
  hasOrder: boolean;
  hasCuttingMaster: boolean;
  profileRole?: string | null;
  currentEmployeeId?: string | null;
  orderSalesManagerId?: string | null;
}): boolean {
  const { hasOrder, hasCuttingMaster, profileRole, currentEmployeeId, orderSalesManagerId } = params;
  if (!hasOrder || hasCuttingMaster) return false;
  if (profileRole === 'admin') return true;
  return !!currentEmployeeId && !!orderSalesManagerId && currentEmployeeId === orderSalesManagerId;
}
