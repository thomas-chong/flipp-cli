import { FlippError, ExitCode } from "./errors.js";
import type {
  Locale,
  SearchResponse,
  FlyersResponse,
  MerchantsResponse,
  LocationInfo,
  FlippCoupon,
} from "./types.js";

export interface CouponDataResponse {
  coupons: FlippCoupon[];
  loyalty_program_coupons: FlippCoupon[];
  flyer_item_coupons: FlippCoupon[];
  refreshed_at?: string;
}

const BASE = "https://backflipp.wishabi.com/flipp";
const LOCATION_BASE = "https://flyers-ng.flippback.com/api/flipp";

const UA = "flipp-cli/0.1 (+https://github.com/your-org/flipp-cli)";

interface FetchOpts {
  query?: Record<string, string | number | undefined>;
  timeoutMs?: number;
}

async function get<T>(url: string, opts: FetchOpts = {}): Promise<T> {
  const u = new URL(url);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    u.searchParams.set(k, String(v));
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);
  try {
    const res = await fetch(u.toString(), {
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": UA },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new FlippError({
        code: res.status === 404 ? "not_found" : "upstream_error",
        message: `Flipp API ${res.status} ${res.statusText} for ${u.pathname}`,
        exitCode: res.status === 404 ? ExitCode.NotFound : ExitCode.RateLimitOrNetwork,
        detail: { url: u.toString(), status: res.status },
      });
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof FlippError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new FlippError({
        code: "timeout",
        message: `Request to ${u.pathname} timed out after ${opts.timeoutMs ?? 15_000}ms`,
        exitCode: ExitCode.RateLimitOrNetwork,
      });
    }
    throw new FlippError({
      code: "network_error",
      message: err instanceof Error ? err.message : String(err),
      exitCode: ExitCode.RateLimitOrNetwork,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export interface CommonParams {
  postal_code: string;
  locale?: Locale;
}

export async function searchItems(
  params: CommonParams & { q: string; sort_type?: string },
): Promise<SearchResponse> {
  return get<SearchResponse>(`${BASE}/items/search`, {
    query: {
      locale: params.locale ?? "en-ca",
      postal_code: params.postal_code,
      q: params.q,
      sort_type: params.sort_type,
    },
  });
}

export async function listFlyers(params: CommonParams): Promise<FlyersResponse> {
  return get<FlyersResponse>(`${BASE}/flyers`, {
    query: { locale: params.locale ?? "en-ca", postal_code: params.postal_code },
  });
}

export async function listMerchants(params: CommonParams): Promise<MerchantsResponse> {
  return get<MerchantsResponse>(`${BASE}/merchants`, {
    query: { locale: params.locale ?? "en-ca", postal_code: params.postal_code },
  });
}

export async function locateByIp(): Promise<LocationInfo> {
  return get<LocationInfo>(`${LOCATION_BASE}/location_info/by_ip`);
}

export async function getCouponData(params: CommonParams): Promise<CouponDataResponse> {
  return get<CouponDataResponse>(`${BASE}/data`, {
    query: { locale: params.locale ?? "en-ca", postal_code: params.postal_code },
  });
}
