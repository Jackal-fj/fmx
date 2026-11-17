// FMX-044: single string catalogue. One source of truth for every
// user-visible word in the app.
//
// Shape is a flat object keyed by dotted path. Lookups go through t()
// in ../i18n/t.ts. Non-English locales live in sibling files
// (strings.fj.ts, strings.hi.ts) and only need the keys they translate;
// the fallback chain English → requested locale ensures no empty strings
// render while translations are in progress.
//
// Add every new user-visible string here as it's introduced. Lint can
// flag literals in components later (FMX-044 follow-up).

export type Locale = 'en' | 'fj' | 'hi';

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  fj: 'Vosa Vakaviti',   // iTaukei / Fijian
  hi: 'Fiji Hindi',
};

export type Strings = {
  nav: {
    back: string;
    search: string;
    menu: string;
    dashboard: string;
    portfolio: string;
    work: string;
    resources: string;
    reports: string;
    clients: string;
    properties: string;
    defects: string;
    maintenance: string;
    assets: string;
    vendors: string;
    emailInbox: string;
    labels: string;
    scan: string;
  };
  add: {
    aria: string;
    defect: string;
    asset: string;
    vendor: string;
    client: string;
  };
  common: {
    save: string;
    cancel: string;
    edit: string;
    delete: string;
    yes: string;
    no: string;
    all: string;
    none: string;
    loading: string;
    retry: string;
    close: string;
    required: string;
  };
  sync: {
    local: string;
    queued: string;
    sent: string;
    failed: string;
  };
};

const en: Strings = {
  nav: {
    back: 'Back',
    search: 'Search',
    menu: 'Menu',
    dashboard: 'Dashboard',
    portfolio: 'Portfolio',
    work: 'Work',
    resources: 'Resources',
    reports: 'Reports',
    clients: 'Clients',
    properties: 'Properties',
    defects: 'Defects',
    maintenance: 'Maintenance',
    assets: 'Assets',
    vendors: 'Vendors',
    emailInbox: 'Email Inbox',
    labels: 'QR Labels',
    scan: 'Scan',
  },
  add: {
    aria: 'New record',
    defect: 'Defect',
    asset: 'Asset',
    vendor: 'Vendor',
    client: 'Client',
  },
  common: {
    save: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
    delete: 'Delete',
    yes: 'Yes',
    no: 'No',
    all: 'All',
    none: 'None',
    loading: 'Loading',
    retry: 'Retry',
    close: 'Close',
    required: 'Required',
  },
  sync: {
    local: 'Saved on device',
    queued: 'Waiting to sync',
    sent: 'Submitted',
    failed: 'Sync failed — retry',
  },
};

// Stub catalogues — populate as translators engage (see FMX-044 follow-up).
// DeepPartial so translators only add the keys they've translated; the
// fallback chain in t() fills the rest from English.
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

const fj: DeepPartial<Strings> = {
  // iTaukei translations go here. Start with the most visible terms
  // (nav + add) so pilot crews see immediate payoff.
};

const hi: DeepPartial<Strings> = {
  // Fiji Hindi translations go here.
};

export const CATALOGUES = { en, fj, hi };

export const LOCALE_COOKIE = 'fmx.locale';
export const DEFAULT_LOCALE: Locale = 'en';
