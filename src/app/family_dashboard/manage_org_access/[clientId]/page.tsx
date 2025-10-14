/**
 * File path: /family_dashboard/manage_org_access/[clientId]/page.tsx
 * Mode: Dual (mock = pure-frontend; real = call backend)
 *
 * - Mock mode (NEXT_PUBLIC_ENABLE_MOCK=1):
 *     * Seed from mockApi.MOCK_ORGS
 *     * Actions (Approve/Reject/Revoke) only update local state
 *     * No fetch, no persistence
 * - Real mode:
 *     * GET/POST to API routes
 *     * After POST, re-fetch list
 */

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardChrome from '@/components/top_menu/client_schedule';
import { useActiveClient } from '@/context/ActiveClientContext';
import { getClients, type Client as ApiClient } from '@/lib/data';
import { isMock, MOCK_ORGS } from '@/lib/mock/mockApi';

const colors = {
  pageBg: '#ffd9b3',
  header: '#3A0000',
  notice: '#F9C9B1',
  text: '#2b2b2b',
};

type ClientLite = { id: string; name: string };
type OrgStatus = 'approved' | 'pending' | 'revoked';
type Organisation = { id: string; name: string; status: OrgStatus };

// Map mockApi status -> UI status (active → approved)
const toUI = (s: 'active' | 'pending' | 'revoked'): OrgStatus =>
  s === 'active' ? 'approved' : s;

export default function ManageOrganisationAccessPage() {
  const router = useRouter();
  const { client: activeClient, handleClientChange } = useActiveClient();

  // ---------- Clients ----------
  const [clients, setClients] = useState<ClientLite[]>([]);

  // ---------- Orgs ----------
  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  // Load clients
  useEffect(() => {
    (async () => {
      try {
        const list: ApiClient[] = await getClients();
        setClients(list.map((c) => ({ id: c._id, name: c.name })));
      } catch (err) {
        console.error('Failed to load clients:', err);
        setClients([]);
      }
    })();
  }, []);

  // Load orgs for current client
  useEffect(() => {
    if (!activeClient?.id) {
      setOrgs([]);
      setErrorText('No client selected yet.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorText(null);

    if (isMock) {
      // --- Mock: seed locally, no network ---
      const seeded =
        (MOCK_ORGS ?? []).map((o) => ({
          id: o.id,
          name: o.name,
          status: toUI(o.status),
        })) as Organisation[];
      setOrgs(seeded);
      setLoading(false);
      return;
    }

    // --- Real: fetch from API ---
    (async () => {
      try {
        const res = await fetch(
          `/api/v1/clients/${activeClient.id}/organisations`,
          { cache: 'no-store' }
        );
        if (!res.ok) throw new Error('Failed to fetch organisations.');
        const data = (await res.json()) as Organisation[];
        setOrgs(data);
      } catch (err) {
        console.error(err);
        setErrorText('Failed to load organisations.');
        setOrgs([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [activeClient?.id]);

  // ---- Actions ----
  async function updateOrgStatus(orgId: string, action: 'approve' | 'reject' | 'revoke') {
    if (!activeClient?.id) return;

    if (isMock) {
      // Mock: local-only transition
      setOrgs((prev) =>
        prev.map((o) => {
          if (o.id !== orgId) return o;
          if (action === 'approve') return { ...o, status: 'approved' };
          if (action === 'revoke') return { ...o, status: 'revoked' };
          if (action === 'reject') return { ...o, status: 'revoked' }; // or remove if desired
          return o;
        })
      );
      return;
    }

    // Real: POST then re-fetch
    setLoading(true);
    setErrorText(null);
    try {
      const res = await fetch(
        `/api/v1/clients/${activeClient.id}/organisations/${orgId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        }
      );
      if (!res.ok) throw new Error('Failed to update organisation.');

      const listRes = await fetch(
        `/api/v1/clients/${activeClient.id}/organisations`,
        { cache: 'no-store' }
      );
      if (!listRes.ok) throw new Error('Failed to fetch organisations.');
      const data = (await listRes.json()) as Organisation[];
      setOrgs(data);
    } catch (err) {
      console.error(err);
      setErrorText('Failed to update organisation.');
    } finally {
      setLoading(false);
    }
  }

  // Handle client change from dropdown
  const onClientChange = (id: string) => {
    const selected = clients.find((c) => c.id === id);
    if (!selected) return;
    if (activeClient?.id !== selected.id) {
      handleClientChange(selected.id, selected.name);
    }
  };

  const chromeClients = useMemo(() => clients, [clients]);

  return (
    <DashboardChrome
      page="organisation-access"
      clients={chromeClients}
      onClientChange={onClientChange}
      colors={{
        header: colors.header,
        banner: colors.notice,
        text: colors.text,
      }}
    >
      {/* Page body */}
      <div className="w-full h-full" style={{ backgroundColor: colors.pageBg }}>
        <div className="w-full h-full">
          {/* Section header with back button */}
          <div
            className="w-full px-6 py-4 flex items-center justify-between text-white text-2xl md:text-3xl font-extrabold"
            style={{ backgroundColor: colors.header }}
          >
            <span>Manage Organisation Access</span>
            <button
              onClick={() => router.push('/family_dashboard/people_list')}
              className="text-base md:text-lg font-semibold bg-white/10 px-4 py-1.5 rounded hover:bg-white/20 transition"
              aria-label="Back"
            >
              &lt; Back
            </button>
          </div>

          {/* Content area */}
          <div
            className="w-full h-[630px] rounded-b-xl bg-[#f6efe2] border-x border-b flex flex-col"
            style={{ borderColor: 'transparent' }}
          >
            {/* Notice bar */}
            <div
              className="w-full px-5 py-3 text-black"
              style={{ backgroundColor: colors.notice }}
            >
              <p className="text-center font-semibold">
                Privacy Notice: This information is visible only to you (family
                / POA) and will not be shared with anyone.
              </p>
            </div>

            {/* Lists */}
            <div className="flex-1 px-6 py-6 pb-6 overflow-auto text-black">
              {loading ? (
                <div className="text-black/70">Loading…</div>
              ) : errorText ? (
                <div className="text-red-600">{errorText}</div>
              ) : (
                <>
                  <Group
                    title="Organisations with Access"
                    items={orgs.filter((o) => o.status === 'approved')}
                    onRevoke={(id) => updateOrgStatus(id, 'revoke')}
                  />
                  <hr className="my-5 border-black" />
                  <Group
                    title="Organisations who have Requested Access"
                    items={orgs.filter((o) => o.status === 'pending')}
                    onApprove={(id) => updateOrgStatus(id, 'approve')}
                    onRemove={(id) => updateOrgStatus(id, 'reject')}
                  />
                  <hr className="my-5 border-black" />
                  <Group
                    title="Revoked Organisations"
                    items={orgs.filter((o) => o.status === 'revoked')}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardChrome>
  );
}

/* ---------- Group list block ---------- */
function Group({
  title,
  items,
  onRevoke,
  onRemove,
  onApprove,
}: {
  title: string;
  items: Organisation[];
  onRevoke?: (id: string) => void;
  onRemove?: (id: string) => void;
  onApprove?: (id: string) => void;
}) {
  return (
    <section className="text-base">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-lg">{title}</h3>
      </div>

      {items.length === 0 ? (
        <div className="text-slate-600">None</div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex text-lg items-center justify-between"
            >
              <div>{item.name}</div>
              <div className="flex items-center gap-3 ">
                {item.status === 'approved' && onRevoke && (
                  <button
                    onClick={() => onRevoke(item.id)}
                    className="px-4 py-1.5 rounded-xl text-lg font-medium text-white bg-orange-500 hover:bg-orange-600 transition-colors"
                  >
                    Revoke
                  </button>
                )}
                {item.status === 'pending' && (
                  <>
                    {onApprove && (
                      <button
                        onClick={() => onApprove(item.id)}
                        className="px-4 py-1.5 rounded-xl text-lg font-medium text-white bg-green-600 hover:bg-green-700 transition-colors"
                      >
                        Approve
                      </button>
                    )}
                    {onRemove && (
                      <button
                        onClick={() => onRemove(item.id)}
                        className="px-4 py-1.5 rounded-xl text-lg font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
                      >
                        Reject
                      </button>
                    )}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
