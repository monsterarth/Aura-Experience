# Guest portal (`src/app/check-in/[code]/`)

Guest-facing, **mobile-first**, **no login** (access by stay `code`), must support **PT/EN/ES**.
This is a semi-independent subsystem with its own context, strings, and utilities.

> Status: the "chameleon" redesign is **complete and in production** (see [[guest-portal-redesign]]).

- **Shared state/strings**: `check-in/[code]/_portal/` — the portal context (tabs, sheets,
  DND, toasts, current language) and the inline i18n string maps. Language selection happens
  here, not via an i18n library.
- **Map**: `check-in/[code]/map/` — illustrated resort map with GPS (`hooks/useGPS`),
  coordinate calibration (`utils/geoTransform`), operating hours (`utils/hours`). POIs come
  from the resort-map data.
- **Pages**: home (`page.tsx`), `breakfast`, `structures`, `events`, `map`, `concierge`, and
  the pre-check-in `form/[stayId]`.
- **Backend**: `/api/guest/*` (`today`, `breakfast-menu`, `breakfast-orders`, `structures`,
  `structure-slots`, `structure-bookings`, `structure-reviews`, `resort-map`, `survey`).
- These are **public** routes — `/api/guest/*` intentionally skip `requireAuth`; authorize by
  stay code instead, and never expose cross-property or staff-only data.
- Translatable DB fields follow the `name` / `name_en` / `name_es` convention.

Some portal-local types live alongside the components (`_portal/`, `map/`) rather than in
`aura.ts` — that colocation is fine for view models specific to the portal.
