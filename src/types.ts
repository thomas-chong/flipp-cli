export type Locale = "en-ca" | "en-us" | "fr-ca";

export interface FlippItem {
  id: number;
  flyer_id?: number;
  flyer_item_id?: number;
  item_type?: "flyer" | "ecom";
  name: string;
  current_price: number | null;
  original_price: number | null;
  pre_price_text?: string | null;
  post_price_text?: string | null;
  sale_story?: string | null;
  merchant_id?: number;
  merchant_name?: string;
  merchant?: string;
  merchant_logo?: string;
  clean_image_url?: string;
  clipping_image_url?: string;
  image_url?: string;
  valid_from?: string;
  valid_to?: string;
  brand_ids?: string[];
  _L1?: string;
  _L2?: string;
  score?: number;
  premium?: boolean;
}

export interface FlippFlyer {
  id: number;
  flyer_run_id?: number;
  name: string;
  merchant: string;
  merchant_id: number;
  merchant_logo?: string;
  valid_from: string;
  valid_to: string;
  available_from?: string;
  available_to?: string;
  premium: boolean;
  categories: string[];
  postal_code?: string;
  locale?: string;
  thumbnail_url?: string;
  path?: string;
  width?: number;
  height?: number;
  priority?: number;
}

export interface FlippMerchant {
  id: number;
  name: string;
  name_identifier: string;
  us_based?: boolean;
}

export interface FlippCoupon {
  coupon_id: number;
  merchant_id: number;
  merchant_name: string;
  merchant_logo_url?: string;
  brand?: string | null;
  sale_story: string;
  dollars_off: number | null;
  percent_off: number | null;
  qualifying_quantity?: number | null;
  reward_quantity?: number | null;
  promotion_text?: string;
  redemption_method?: string;
  available_from: string;
  available_to: string;
  valid_from: string;
  valid_to: string;
  coupon_image_url?: string;
  categories: string[];
  premium: boolean;
}

export interface SearchResponse {
  items: FlippItem[];
  ecom_items: FlippItem[];
  flyers: FlippFlyer[] | null;
  merchants: FlippMerchant[] | null;
  coupons: FlippCoupon[] | null;
  related_items?: FlippItem[];
  related_flyers?: FlippFlyer[];
  normalized_query?: string;
}

export interface FlyersResponse {
  flyers: FlippFlyer[];
  category_sort_csv?: string;
  refreshed_at?: string;
}

export interface MerchantsResponse {
  merchants: FlippMerchant[];
}

export interface LocationInfo {
  postal_code: string;
  city_name: string;
  region_name: string;
  country_code: string;
  ip: string;
}
