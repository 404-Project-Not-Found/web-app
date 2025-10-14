'use client';

/**
 * Floating Help FAB — unified pre-login FAQ
 * - Pre-login (login / role-selection / signup-*) → ALWAYS opens faq/help-faq only
 * - Sidebar whitelisted to a single page during pre-login
 * - Post-login keeps existing per-role mappings
 */

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useHelp } from '@/components/help/HelpPanel';
import type { FAQBook } from '@/components/help/faqData';
import { getViewerRole } from '@/lib/data';

type Role = 'family' | 'carer' | 'management';
type Target = { pageKey: keyof FAQBook; sectionId: string };
type Matcher = (p: string) => Target | null;

/* ------------------------- Role resolution ------------------------- */

function useViewerRoleResolved(pathname: string): Role {
  const [role, setRole] = useState<Role | null>(null);

  // 1) hints from window / storage
  useEffect(() => {
    try {
      // @ts-ignore
      const hinted = typeof window !== 'undefined' ? window.__APP_ROLE__ : undefined;
      if (hinted === 'family' || hinted === 'carer' || hinted === 'management') {
        setRole(hinted);
        return;
      }
      if (typeof window !== 'undefined') {
        const s = (
          localStorage.getItem('role') ||
          sessionStorage.getItem('role') ||
          ''
        ).toLowerCase();
        if (s === 'family' || s === 'carer' || s === 'management') {
          setRole(s as Role);
          return;
        }
      }
    } catch { /* ignore */ }
  }, []);

  // 2) async (mock/real) → fallback to path inference
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await getViewerRole();
        if (!alive) return;
        if (r === 'family' || r === 'carer' || r === 'management') {
          setRole(r);
          try { sessionStorage.setItem('role', r); } catch {}
          try { (window as any).__APP_ROLE__ = r; } catch {} 
          return;
        }
      } catch {}
      if (!alive) return;
      setRole(resolveRoleByPath(pathname));
    })();
    return () => { alive = false; };
  }, [pathname]); // always re-check on path change

  return role ?? resolveRoleByPath(pathname);
}

/** Last-resort: infer by path (post-login fallback only) */
function resolveRoleByPath(pathname: string): Role {
  const p = (pathname || '').toLowerCase();

  // **Key fix**: /icon_dashboard should default to management when role is unknown
  if (p.startsWith('/icon_dashboard')) {
    return 'management';
  }

  // Management hints
  if (
    p.includes('/icon_dashboard') ||
    p.startsWith('/staff_list') ||
    p.startsWith('/clients_list') ||
    p.startsWith('/manage_care_item') ||
    p.startsWith('/register_client') ||
    p.startsWith('/requests') ||
    p.startsWith('/staff_schedule') ||
    p.startsWith('/old_organisation_access') ||
    p.startsWith('/organisation') ||
    p.startsWith('/partial_dashboard') ||
    p.startsWith('/request-log-page') ||
    p.startsWith('/icon_dashboard') ||
    p.startsWith('/reset_password') ||
    p.startsWith('/reset_password_link')
  ) return 'management';

  // Family hints
  if (
    p.startsWith('/calendar_dashboard') ||
    p.startsWith('/client_profile') ||
    p.startsWith('/family_dashboard')
  ) return 'family';

  // Carer hint
  if (p.includes('/carer')) return 'carer';

  return 'family';
}
/* -------------------- Pre-login path detector -------------------- */
function isPreLoginPath(pathname: string): boolean {
  const p = (pathname || '/').toLowerCase();

  // Login-related routes
  if (
    p === '/' ||
    p === '/login' || p.startsWith('/login') ||
    p === '/signin' || p.startsWith('/signin') ||
    p.startsWith('/auth/login') || p.startsWith('/auth/signin')
  ) return true;

  // Your actual route: /role (role selection main page + its subroutes)
  if (p === '/role' || p.startsWith('/role')) return true;

  // Your actual route: /organisation (management organisation flow + its subroutes)
  if (p === '/organisation' || p.startsWith('/organisation')) return true;

  // Backward-compatible aliases (optional)
  if (
    p === '/signup' || p.startsWith('/signup') ||
    p === '/register' || p.startsWith('/register') ||
    p === '/create-account' || p.startsWith('/create-account') ||
    p === '/choose-role' || p.startsWith('/choose-role') ||
    p === '/role-selection' || p.startsWith('/role-selection') ||
    p === '/sign-up' || p.startsWith('/sign-up')
  ) return true;

  return false;
}

/* -------------------- Pre-login (route + query) resolver -------------------- */
/**
 * Unifies all “pre-login” pages (/login*, /role*, /organisation*, etc.)
 * under a single page: faq/help-faq, using sectionId anchors for navigation.
 *
 * Rules (based on your routes):
 * - /login* → faq-login
 * - /role*  → no role: faq-role-select
 *              role=family → faq-signup-family
 *              role=carer  → faq-signup-carer
 *              role=management → no org → faq-mgmt-org-choice;
 *                                 org=create|join → faq-signup-management
 * - /organisation* → no org/create|join → faq-mgmt-org-choice;
 *                    otherwise → faq-signup-management
 */
function resolvePreLogin(pathname: string, search: URLSearchParams): Target | null {
  const p = (pathname || '/').toLowerCase();
  const role = (search.get('role') || '').toLowerCase();
  const org  = (search.get('org')  || '').toLowerCase();

  if (!isPreLoginPath(p)) return null;

  // A) Login-related → prelogin/login
  if (
    p === '/' ||
    p === '/login' || p.startsWith('/login') ||
    p === '/signin' || p.startsWith('/signin') ||
    p.startsWith('/auth/login') || p.startsWith('/auth/signin')
  ) {
    return { pageKey: 'prelogin/login', sectionId: 'login' };
  }

  // B) /role
  if (p === '/role' || p.startsWith('/role')) {
    if (!role) return { pageKey: 'prelogin/role', sectionId: 'role-select' };

    if (role === 'family') return { pageKey: 'prelogin/signup-family', sectionId: 'signup-family' };
    if (role === 'carer')  return { pageKey: 'prelogin/signup-carer',  sectionId: 'signup-carer'  };
    if (role === 'management') {
      if (!org) return { pageKey: 'prelogin/mgmt-org-choice', sectionId: 'mgmt-org-choice' };
      return { pageKey: 'prelogin/signup-management', sectionId: 'signup-management' };
    }
    return { pageKey: 'prelogin/role', sectionId: 'role-select' };
  }

  // C) /organisation
  if (p === '/organisation' || p.startsWith('/organisation')) {
    const inCreateJoin = /\/organisation\/(create|join)/.test(p);
    if (!inCreateJoin && !org) {
      return { pageKey: 'prelogin/mgmt-org-choice', sectionId: 'mgmt-org-choice' };
    }
    return { pageKey: 'prelogin/signup-management', sectionId: 'signup-management' };
  }

  // D) legacy /signup*
  if (p.startsWith('/signup')) {
    if (role === 'family') return { pageKey: 'prelogin/signup-family', sectionId: 'signup-family' };
    if (role === 'carer')  return { pageKey: 'prelogin/signup-carer',  sectionId: 'signup-carer'  };
    if (role === 'management') {
      if (!org) return { pageKey: 'prelogin/mgmt-org-choice', sectionId: 'mgmt-org-choice' };
      return { pageKey: 'prelogin/signup-management', sectionId: 'signup-management' };
    }
    return { pageKey: 'prelogin/role', sectionId: 'role-select' };
  }

  // fallback
  return { pageKey: 'prelogin/role', sectionId: 'role-select' };
}



/* ----------------------- Post-login Route → FAQ tables ----------------------- */
/** Helpers for robust path matching */
const reBudget = /^\/calendar_dashboard\/(budget[_-]report|category[-_]cost)(\/|$)/i;
const reTxn    = /^\/calendar_dashboard\/(transaction[_-]history|add[_-]tran|add[_-]transaction)(\/|$)/i;
const reCalAny = /^\/calendar_dashboard(\/|$)/i;

/** FAMILY */
const familyMatchers: Matcher[] = [
  (p) => reBudget.test(p)
      ? { pageKey: 'family/budget-report', sectionId: 'family-budget-report' }
      : null,
  (p) => reTxn.test(p)
      ? { pageKey: 'family/view-transaction', sectionId: 'family-view-transactions' }
      : null,
  (p) =>
    p.startsWith('/client_profile')
      ? { pageKey: 'family/client-profile', sectionId: 'family-client-profile' }
      : null,
  (p) =>
    p.startsWith('/family_dashboard/people_list')
      ? { pageKey: 'family/my-clients', sectionId: 'family-my-clients' }
      : null,
  (p) =>
    p.startsWith('/family_dashboard/manage_organisation_access') ||
    p.startsWith('/family_dashboard/manage_org_access')
      ? { pageKey: 'family/organisation-access', sectionId: 'family-organisation-access' }
      : null,
  (p) =>
    p.startsWith('/family_dashboard/request_of_change_page')
      ? { pageKey: 'family/request-form', sectionId: 'family-request-form' }
      : null,
  (p) =>
    p.includes('/update_details')
      ? { pageKey: 'family/update-details', sectionId: 'family-update-details' }
      : null,
  (p) =>
    p.includes('/staff_schedule')
      ? { pageKey: 'family/staff-schedule', sectionId: 'family-staff-schedule' }
      : null,
  (p) => reCalAny.test(p)
      ? { pageKey: 'family/client-schedule', sectionId: 'family-client-schedule' }
      : null,
  (p) =>
    p.startsWith('/icon_dashboard')
      ? { pageKey: 'family/dashboard', sectionId: 'family-dashboard-overview' }
      : null,
];

/** CARER */
const carerMatchers: Matcher[] = [
  (p) =>
    p.includes('/update_details')
      ? { pageKey: 'carer/update-details', sectionId: 'carer-update-details' }
      : null,
  (p) => reBudget.test(p)
      ? { pageKey: 'carer/budget-report', sectionId: 'carer-budget-report' }
      : null,
  (p) => reTxn.test(p)
      ? { pageKey: 'carer/view-transactions', sectionId: 'carer-view-transactions' }
      : null,
  (p) =>
    p.startsWith('/client_profile')
      ? { pageKey: 'carer/client-profile', sectionId: 'carer-client-profile' }
      : null,
  (p) =>
    p.includes('/update_details')
      ? { pageKey: 'carer/update-details', sectionId: 'carer-update-details' }
      : null,
  (p) =>
    p.includes('/staff_schedule')
      ? { pageKey: 'carer/staff-schedule', sectionId: 'carer-staff-schedule' }
      : null,
  (p) => reCalAny.test(p)
      ? { pageKey: 'carer/client-schedule', sectionId: 'carer-client-schedule' }
      : null,
  (p) =>
    p.startsWith('/icon_dashboard')
      ? { pageKey: 'carer/dashboard', sectionId: 'carer-dashboard-overview' }
      : null,
];

/** MANAGEMENT */
const managementMatchers: Matcher[] = [
  (p) =>
    p.includes('/staff_list')
      ? { pageKey: 'management/staff-list', sectionId: 'management-staff-list' }
      : null,
  (p) =>
    p.includes('/staff_schedule')
      ? { pageKey: 'management/staff-schedule', sectionId: 'management-staff-schedule' }
      : null,
  (p) =>
    p.includes('/clients_list')
      ? { pageKey: 'management/client-list', sectionId: 'management-client-list' }
      : null,
  (p) =>
    p.includes('/requests')
      ? { pageKey: 'management/requests', sectionId: 'management-requests' }
      : null,
  (p) =>
    p.includes('/manage_care_item/edit')
      ? { pageKey: 'management/edit-care-items', sectionId: 'edit-care-item' }
      : null,
  (p) =>
    p.includes('/manage_care_item/add')
      ? { pageKey: 'management/add-care-items', sectionId: 'add-care-item' }
      : null,
  (p) =>
    p.includes('/register_client')
      ? { pageKey: 'management/register-client', sectionId: 'management-register-client' }
      : null,
  (p) =>
    p.includes('/old_organisation_access') || p.includes('/organisation')
      ? { pageKey: 'management/organisation', sectionId: 'management-organisation' }
      : null,
  (p) =>
    p.includes('/request-log-page')
      ? { pageKey: 'management/request-log', sectionId: 'management-request-log' }
      : null,
  (p) =>
    p.includes('/update_details')
      ? { pageKey: 'management/update-details', sectionId: 'management-update-details' }
      : null,

  // ----- SPECIFIC CALENDAR SUBPAGES BEFORE GENERIC -----
  (p) => reBudget.test(p)
      ? { pageKey: 'management/budget-report', sectionId: 'management-budget-report' }
      : null,
  (p) => reTxn.test(p)
      ? { pageKey: 'management/view-transactions', sectionId: 'management-view-transactions' }
      : null,

  // Generic calendar fallback → client schedule
  (p) => reCalAny.test(p)
      ? { pageKey: 'management/client-schedule', sectionId: 'management-client-schedule' }
      : null,

  (p) =>
    p.startsWith('/icon_dashboard')
      ? { pageKey: 'management/dashboard', sectionId: 'management-dashboard-overview' }
      : null,
];

/** Unified resolver: pre-login first; then post-login mappings */
function resolveByRoleAndPath(
  role: Role,
  pathname: string,
  search: URLSearchParams
): Target {
  // 0) Pre-login detection first (LOCK to unified page)
  const pre = resolvePreLogin(pathname, search);
  if (pre) return pre;

  // 1) Post-login, match by role
  const p = (pathname || '/').toLowerCase();
  const tables: Record<Role, Matcher[]> = {
    family: familyMatchers,
    carer: carerMatchers,
    management: managementMatchers,
  };
  for (const fn of tables[role]) {
    const hit = fn(p);
    if (hit) return hit;
  }

  // 2) Fallbacks
  switch (role) {
    case 'family':
      return { pageKey: 'family/dashboard', sectionId: 'family-dashboard-overview' };
    case 'carer':
      return { pageKey: 'carer/dashboard', sectionId: 'carer-dashboard-overview' };
    case 'management':
      return { pageKey: 'management/dashboard', sectionId: 'management-dashboard-overview' };
    default:
      return { pageKey: 'family/dashboard', sectionId: 'family-dashboard-overview' };
  }
}

/* ------------------------------ Button ------------------------------ */
export default function FloatingHelpButton() {
  const pathname = usePathname() || '/';
  const search = useSearchParams();
  const role = useViewerRoleResolved(pathname);
  const { open } = useHelp();

  const target = useMemo(
    () => resolveByRoleAndPath(role, pathname, search ?? new URLSearchParams()),
    [role, pathname, search]
  );

  const isPreLogin = String(target.pageKey) === 'faq/help-faq';

  return (
    <button
      type="button"
      aria-label="Help"
      title="Help"
      onClick={() =>
        isPreLogin
          ? open(target.pageKey, target.sectionId, { allowedPageKeys: [target.pageKey] })
          : open(target.pageKey, target.sectionId)
      }
      className="fixed bottom-6 right-6 flex h-12 w-12 items-center justify-center rounded-full bg-[#F08479] text-white text-2xl font-bold shadow-md hover:shadow-lg hover:bg-[#E57266] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
    >
      ?
      <span className="sr-only">Help</span>
    </button>
  );
}
