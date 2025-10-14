// File: src/lib/orgs.ts
// Purpose: Data-access layer for "organisation access" that plugs directly into
//          your existing mockApi (src/lib/mock/mockApi.ts) when mock mode is ON,
//          and calls real backend when OFF.
//
// Pages consume *UI-normalized* statuses: 'approved' | 'pending' | 'revoked'.
// In mock mode we map mockApi's 'active' -> 'approved' to keep UI consistent.

import { isMock, MOCK_ORGS, type Organisation as MockOrg } from '@/lib/mock/mockApi';

// --------------------------- UI Types ---------------------------

/** UI-facing organisation type (what your pages/components expect). */
export type Organisation = {
  id: string;
  name: string;
  status: 'approved' | 'pending' | 'revoked';
};

// --------------------------- Status Mapping ---------------------------

/**
 * Map mockApi status -> UI status.
 * mockApi:  'active' | 'pending' | 'revoked'
 * UI:       'approved' | 'pending' | 'revoked'
 */
function toUIStatus(status: MockOrg['status']): Organisation['status'] {
  if (status === 'active') return 'approved';
  return status; // 'pending' | 'revoked'
}

/** Map UI action -> UI status mutation. */
function applyActionToStatus(
  current: Organisation['status'],
  action: 'approve' | 'reject' | 'revoke'
): Organisation['status'] {
  if (action === 'approve') return 'approved';
  if (action === 'revoke')  return 'revoked';
  if (action === 'reject')  return 'revoked'; // If you prefer "reject = remove", handle in code below
  return current;
}

// --------------------------- Local Persistence (mock) ---------------------------

/** Compose a stable localStorage key for per-client org list. */
function lsKey(clientId: string) {
  return `mock_orgs_${clientId}`;
}

/** Load per-client orgs from localStorage; if absent, fall back to seed. */
function mockLoad(clientId: string): Organisation[] {
  // 1) Try persisted list
  if (typeof window !== 'undefined') {
    const raw = localStorage.getItem(lsKey(clientId));
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Organisation[];
        // Basic shape guard
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // ignore parsing errors and fall through to seed
      }
    }
  }

  // 2) Fallback to seed from mockApi (global MOCK_ORGS, non client-specific)
  //    If you have a per-client map in the future, swap in here.
  const seeded: Organisation[] = (MOCK_ORGS ?? []).map((o: MockOrg) => ({
    id: o.id,
    name: o.name,
    status: toUIStatus(o.status),
  }));

  return seeded;
}

/** Save per-client org list to localStorage. */
function mockSave(clientId: string, list: Organisation[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(lsKey(clientId), JSON.stringify(list));
}

/** Small helper to simulate network latency in mock mode. */
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// --------------------------- Public API ---------------------------

/**
 * Fetch organisations for a client.
 * - Mock: read from localStorage (or MOCK_ORGS seed) and return UI-normalized statuses.
 * - Real: GET /api/v1/clients/:clientId/organisations
 */
export async function getOrganisations(clientId: string): Promise<Organisation[]> {
  if (!clientId) return [];

  if (isMock) {
    await sleep(100);
    return mockLoad(clientId);
  }

  // Real backend
  const res = await fetch(`/api/v1/clients/${clientId}/organisations`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error('Failed to fetch organisations.');
  }
  // If backend already uses UI statuses, this cast is fine.
  // If backend returns another shape, normalize here.
  const data = (await res.json()) as Organisation[];
  return Array.isArray(data) ? data : [];
}

/**
 * Update a single organisation status, then return the UPDATED list.
 * Supported actions: 'approve' | 'reject' | 'revoke'
 *
 * - Mock:
 *   * We mutate the per-client list in localStorage.
 *   * Default behavior: 'reject' -> set status to 'revoked'.
 *     If you prefer removing the org entirely on reject, uncomment the filter section.
 *
 * - Real:
 *   * POST /api/v1/clients/:clientId/organisations/:orgId  body: { action }
 *   * Then re-fetch to keep the UI in sync.
 */
export async function updateOrganisation(
  clientId: string,
  orgId: string,
  action: 'approve' | 'reject' | 'revoke'
): Promise<Organisation[]> {
  if (!clientId || !orgId) return getOrganisations(clientId);

  if (isMock) {
    const list = mockLoad(clientId);
    let next = list.map((o) =>
      o.id === orgId ? { ...o, status: applyActionToStatus(o.status, action) } : o
    );

    // If you want "reject" to remove the entry completely, enable this:
    // if (action === 'reject') {
    //   next = next.filter((o) => o.id !== orgId);
    // }

    mockSave(clientId, next);
    await sleep(80);
    return next;
  }

  // Real backend
  const res = await fetch(
    `/api/v1/clients/${clientId}/organisations/${orgId}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    }
  );
  if (!res.ok) {
    throw new Error('Failed to update organisation.');
  }

  // Always re-fetch for a single source of truth
  return getOrganisations(clientId);
}

// --------------------------- Optional helpers ---------------------------

/**
 * Replace the entire organisation list in mock mode (useful for tests/tools).
 * No-op in real mode.
 */
export async function setOrganisationsMockOnly(
  clientId: string,
  list: Organisation[]
): Promise<void> {
  if (!isMock) return;
  mockSave(clientId, list);
}

/**
 * Reset a client's mock org list back to seed (from MOCK_ORGS).
 * No-op in real mode.
 */
export async function resetOrganisationsToSeedMockOnly(clientId: string): Promise<void> {
  if (!isMock) return;
  const seed = (MOCK_ORGS ?? []).map((o: MockOrg) => ({
    id: o.id,
    name: o.name,
    status: toUIStatus(o.status),
  }));
  mockSave(clientId, seed);
}
