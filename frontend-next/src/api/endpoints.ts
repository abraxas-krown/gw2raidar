// One function per JSON endpoint of docs/frontend-api.md (the same list as frontend/assets/api.js).
import { get, post, postWithProgress, type FormFields } from './client';
import type { Bootstrap, Encounter, EncounterRow, ReplayData, Session } from './types';

// login.json and register.json answer as initial.json, plus the new CSRF token (Django sets the cookie itself)
export type LoginResponse = Session & { csrftoken?: string; page?: unknown };

export const api = {
  // Reference data, the same for every user; revalidated on every load (ETag)
  bootstrap: () => get<Bootstrap>('bootstrap.json'),
  // The signed-in user (or the anonymous one); also sets the CSRF cookie
  initial: () => get<Session>('initial.json'),

  // Pages' data
  encounters: () => get<{ encounters: EncounterRow[] }>('encounters.json', { expect: [401] }),
  encounter: (urlId: string) =>
    get<{ encounter: Encounter }>(`encounter/${encodeURIComponent(urlId)}.json`, { expect: [404] }),
  replay: (urlId: string) => get<ReplayData>(`replay/${encodeURIComponent(urlId)}.json`),
  leaderboards: (kind: number, era?: string | number | null) =>
    get<{ leaderboards: unknown }>('leaderboards.json', { query: { kind, era: era ?? '' } }),
  profile: (eraId?: string | number | null) => get<{ profile: unknown }>(`profile${eraId ? '/' + eraId : ''}.json`),
  globalStats: (eraId?: string | number | null, statsPage?: string | number | null) => {
    let path = 'global_stats';
    if (eraId) path += '/' + eraId;
    if (statsPage) path += (Number(statsPage) > 0 ? '/area-' : '/') + encodeURIComponent(statsPage);
    return get<{ global_stats: unknown }>(path + '.json', { expect: [404] });
  },
  profileGraph: (query: FormFields) =>
    post<{ globals?: { per: Record<number, number>; avg: number }; data: number[]; times: number[] }>(
      'profile_graph.json',
      query,
    ),

  // Authentication
  login: (username: string, password: string) => post<LoginResponse>('login.json', { username, password }),
  register: (fields: { username: string; password: string; api_key: string; invite_code: string }) =>
    post<LoginResponse>('register.json', fields),
  resetPassword: (email: string) => post<Record<string, never>>('reset_pw.json', { email }),
  logout: () => post<Record<string, never>>('logout.json'),

  // Account
  changePassword: (fields: { old_password: string; new_password1: string; new_password2: string }) =>
    post<Record<string, never>>('change_password.json', fields),
  changeEmail: (email: string) => post<{ email: string }>('change_email.json', { email }),
  addAPIKey: (apiKey: string) => post<{ account_name: string }>('add_api_key.json', { api_key: apiKey }),
  removeAPIKey: (accountName: string) =>
    post<{ account_name: string }>('remove_api_key.json', { account_name: accountName }),
  setPrivacy: (privacy: number) => post<Record<string, never>>('privacy.json', { privacy }),
  contact: (fields: FormFields) => post<Record<string, never>>('contact.json', fields),

  // Encounters
  setTagsAndCategory: (id: number, tags: string, category: number | string | null | undefined) =>
    post<Record<string, never>>('set_tags_cat.json', { id, tags, category }),
  // form: FormData with `file` (and `category`, `tags`); the result arrives later through poll()
  upload: (form: FormData, onProgress?: (event: ProgressEvent) => void) =>
    postWithProgress<{ filename: string; upload_id: number }>('upload.json', form, onProgress),
  // notifications since lastId (processed uploads), and the server's version
  poll: (lastId?: number) =>
    post<{ notifications: unknown[]; version: string; last_id?: number }>(
      'poll.json',
      lastId ? { last_id: lastId } : undefined,
    ),
};
