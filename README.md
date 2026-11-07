# Carevanta Provider Portal

The web app for the people who deliver care on Carevanta: doctors, hospitals and clinics, diagnostic labs and imaging centres, pharmacies and ambulance operators. One sign-in, one portal; what a person sees depends on which organisation they are acting for and what their role there allows.

It talks only to the Carevanta API (`NEXT_PUBLIC_API_URL`). There is no server-side state here.

## Run it

```bash
npm install
cp .env.local.example .env.local   # or set NEXT_PUBLIC_API_URL=http://localhost:4000
npm run dev                        # http://localhost:3001
```

The API must allow this origin: add `http://localhost:3001` to `CORS_ORIGINS` in the API's `.env` and restart it.

To get realistic accounts to click through, run the API's demo seed (`npm run demo:seed` in the API repo). It prints one login per provider type.

## Checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## How it is put together

| Folder | What lives there |
| --- | --- |
| `src/app/login`, `forgot-password`, `reset-password` | Public auth screens |
| `src/app/(portal)` | Every signed-in screen, one folder per page |
| `src/components/layout` | `PortalShell` (sidebar, org switcher, phone bottom bar) and `portal-nav.ts` (which pages each provider type and role gets) |
| `src/components/ui` | Shared primitives: dialog with the black header, cards, badges, data table, toasts |
| `src/components/forms` | Map picker (Leaflet + OpenStreetMap, no API key) and location fields |
| `src/lib/portal.tsx` | Active organisation, capabilities, `can()` |
| `src/lib/api.ts`, `hooks.ts` | Fetch wrapper with token refresh, `useGet` / `useAction` / `useFilters` |

### Who sees what

A membership carries a role (OWNER, ADMIN, MANAGER, RECEPTIONIST, PHARMACIST, DISPATCHER, …) and the API turns that into capabilities such as `manage_bookings`, `manage_schedules`, `publish_reports`, `manage_inventory`, `manage_dispatch`, `view_finance`. Pages check them with `RequireCapability`, the nav hides what you cannot do, and the API enforces the same rules regardless.

A doctor is the owner of their own DOCTOR provider, so the same portal serves a solo practitioner and a hospital's front desk. Facility staff can only schedule doctors with an active, verified affiliation.

### Conventions

- Title Case labels, 5 px radius on every surface, black dialog headers.
- Mobile first: the sidebar becomes a drawer, the most used pages sit in a bottom bar, tables scroll sideways.
- Money is handled in minor units (paise) end to end and formatted only for display.
- Times are shown in Indian Standard Time.
- No hard-coded geography: regions, departments, services and medicines come from the API catalogue.

## Demo Logins

All demo accounts (Super Admin, one per provider type, patient) with passwords and what data each one sees: see [Carevanta_Backedn_Api/docs/demo-logins.md](../Carevanta_Backedn_Api/docs/demo-logins.md). Development only.
