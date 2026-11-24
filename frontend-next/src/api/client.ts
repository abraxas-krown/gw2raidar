// The only code that talks to the backend: fetch with the base URL, the CSRF header and the error conventions
// of docs/frontend-api.md.

const baseMeta = document.querySelector<HTMLMetaElement>('meta[name="raidar-base"]');
export const BASE_URL = baseMeta?.content || '/';

// A failed request. `expected` is set for the statuses the caller said it handles (a 404 for an encounter that
// does not exist), which are not reported as errors to the user. `serverMessage` is the `{error}` of a 200
// response, which the backend uses for most failures.
export class ApiError extends Error {
  readonly status: number;
  readonly expected: boolean;
  readonly serverMessage?: string;

  constructor(message: string, status: number, expected: boolean, serverMessage?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.expected = expected;
    this.serverMessage = serverMessage;
  }
}

// Django keeps the CSRF token in this cookie (initial.json makes sure it is set) and replaces it on login, so
// it is read fresh for every request
function csrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export type FormFields = Record<string, string | number | boolean | null | undefined>;

// POST bodies are form-urlencoded, as Django's request.POST expects; null and undefined are sent empty
function formBody(fields: FormFields): URLSearchParams {
  const body = new URLSearchParams();
  Object.entries(fields).forEach(([key, value]) => body.append(key, value == null ? '' : String(value)));
  return body;
}

export interface RequestOptions {
  // HTTP statuses the caller handles itself
  expect?: number[];
  query?: FormFields;
}

export async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  data?: FormFields | FormData,
  options: RequestOptions = {},
): Promise<T> {
  let url = BASE_URL + path;
  if (options.query) {
    const query = formBody(options.query).toString();
    if (query) url += '?' + query;
  }
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET') {
    const token = csrfToken();
    if (token) headers['X-CSRFToken'] = token;
  }
  const body = data === undefined ? undefined : data instanceof FormData ? data : formBody(data);

  let response: Response;
  try {
    response = await fetch(url, { method, headers, body, credentials: 'same-origin' });
  } catch {
    throw new ApiError('Error communicating to server', 0, false);
  }
  const expected = (options.expect || []).includes(response.status);
  if (!response.ok) {
    throw new ApiError('Error communicating to server', response.status, expected);
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new ApiError('Error communicating to server', response.status, false);
  }
  if (json && typeof json === 'object' && 'error' in json && (json as { error?: unknown }).error) {
    const message = String((json as { error: unknown }).error);
    throw new ApiError(message, response.status, false, message);
  }
  return json as T;
}

export const get = <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options);
export const post = <T>(path: string, data?: FormFields | FormData, options?: RequestOptions) =>
  request<T>('POST', path, data, options);

// A multipart upload with progress events, which fetch cannot report
export function postWithProgress<T>(path: string, form: FormData, onProgress?: (event: ProgressEvent) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', BASE_URL + path);
    const token = csrfToken();
    if (token) xhr.setRequestHeader('X-CSRFToken', token);
    if (onProgress) xhr.upload.addEventListener('progress', onProgress);
    xhr.onload = () => {
      let json: { error?: string } | undefined;
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        // not JSON
      }
      if (xhr.status < 200 || xhr.status >= 300 || !json) {
        reject(new ApiError('Error communicating to server', xhr.status, false));
      } else if (json.error) {
        reject(new ApiError(json.error, xhr.status, false, json.error));
      } else {
        resolve(json as T);
      }
    };
    xhr.onerror = () => reject(new ApiError('Error communicating to server', 0, false));
    xhr.send(form);
  });
}
