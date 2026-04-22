import test from 'node:test';
import assert from 'node:assert/strict';

function resolveProfileAfterRefresh(currentProfile, fetchedProfile) {
  if (fetchedProfile) return fetchedProfile;
  return currentProfile;
}

function canEditOrderAction({ hasOrder, hasCuttingMaster, profileRole, currentEmployeeId, orderSalesManagerId }) {
  if (!hasOrder || hasCuttingMaster) return false;
  if (profileRole === 'admin') return true;
  return !!currentEmployeeId && !!orderSalesManagerId && currentEmployeeId === orderSalesManagerId;
}

test('role persistence: keeps existing admin profile when refresh returns null', () => {
  const current = { role: 'admin' };
  const resolved = resolveProfileAfterRefresh(current, null);
  assert.equal(resolved?.role, 'admin');
});

test('role persistence: uses fetched profile when refresh succeeds', () => {
  const current = { role: 'admin' };
  const fetched = { role: 'admin' };
  const resolved = resolveProfileAfterRefresh(current, fetched);
  assert.equal(resolved?.role, 'admin');
});

test('edit-order visibility: admin can edit even if sales manager mismatch', () => {
  const canEdit = canEditOrderAction({
    hasOrder: true,
    hasCuttingMaster: false,
    profileRole: 'admin',
    currentEmployeeId: 'emp-1',
    orderSalesManagerId: 'emp-2',
  });
  assert.equal(canEdit, true);
});

test('edit-order visibility: non-admin can edit only own order without cutting master', () => {
  const canEditOwn = canEditOrderAction({
    hasOrder: true,
    hasCuttingMaster: false,
    profileRole: 'sales manager',
    currentEmployeeId: 'emp-1',
    orderSalesManagerId: 'emp-1',
  });
  const canEditOther = canEditOrderAction({
    hasOrder: true,
    hasCuttingMaster: false,
    profileRole: 'sales manager',
    currentEmployeeId: 'emp-1',
    orderSalesManagerId: 'emp-2',
  });
  const blockedByCuttingMaster = canEditOrderAction({
    hasOrder: true,
    hasCuttingMaster: true,
    profileRole: 'sales manager',
    currentEmployeeId: 'emp-1',
    orderSalesManagerId: 'emp-1',
  });

  assert.equal(canEditOwn, true);
  assert.equal(canEditOther, false);
  assert.equal(blockedByCuttingMaster, false);
});
