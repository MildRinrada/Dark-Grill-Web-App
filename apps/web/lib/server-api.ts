import 'server-only';
import type { Branch, ItemDetail, MenuPayload } from './types';

const API_URL = process.env.API_INTERNAL_URL;

/**
 * Server-side call to the API. Locally (and on any Node host) API_INTERNAL_URL points at it;
 * on Cloudflare it is left unset and the request goes over the API service binding instead,
 * so the API worker never needs a public route.
 */
export async function apiFetch(path: string, revalidate: number): Promise<Response> {
  if (API_URL) {
    const key = process.env.INTERNAL_API_KEY;
    return fetch(`${API_URL}/api/v1${path}`, { next: { revalidate }, headers: key ? { 'x-internal-key': key } : undefined });
  }
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const { env } = await getCloudflareContext({ async: true });
  return (env as unknown as { API: { fetch: typeof fetch } }).API.fetch(`https://api.internal/api/v1${path}`);
}

async function get<T>(path: string, revalidate: number): Promise<T | null> {
  try {
    const res = await apiFetch(path, revalidate);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const getMenu = (branchId: string) => get<MenuPayload>(`/menu?branchId=${encodeURIComponent(branchId)}&rank=context`, 30);
export const getItem = (slug: string, branchId: string) =>
  get<ItemDetail>(`/menu/items/${encodeURIComponent(slug)}?branchId=${encodeURIComponent(branchId)}`, 30);
export const getBranches = () => get<{ data: Branch[] }>('/branches', 300);
export const getBuilderIngredients = <T>(branchId: string) => get<T>(`/builder/ingredients?branchId=${encodeURIComponent(branchId)}`, 30);
