export type Role = 'CUSTOMER' | 'OWNER' | 'MANAGER' | 'CASHIER' | 'KITCHEN' | 'RIDER';
export type Channel = 'WEB' | 'LINE' | 'QR' | 'KIOSK';
export type FulfillmentType = 'DELIVERY' | 'PICKUP' | 'DINE_IN';
export type PaymentMethod = 'PROMPTPAY' | 'CARD' | 'CASH';
export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'EXPIRED'
  | 'PAID'
  | 'CANCELLED'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'COMPLETED';

export interface SessionUser {
  id: string;
  phone: string | null;
  name: string | null;
  role: Role;
  branchId: string | null;
}

export interface MenuCard {
  id: string;
  slug: string;
  categoryId: string;
  name: string;
  nameEn: string;
  description: string;
  priceSatang: number;
  compareAtSatang: number | null;
  imageUrl: string;
  calories: number;
  allergens: string[];
  prepMinutes: number;
  spicyLevel: number;
  isVegetarian: boolean;
  isSignature: boolean;
  hasOptions: boolean;
  isAvailable: boolean;
}

export interface MenuCategory {
  id: string;
  slug: string;
  name: string;
  nameEn: string;
  icon: string;
  kind: string;
  items: MenuCard[];
}

export interface MenuPayload {
  branch: { id: string; name: string; isOpen: boolean };
  categories: MenuCategory[];
  rankedFor?: string;
}

export interface OptionView {
  id: string;
  name: string;
  priceDeltaSatang: number;
  caloriesDelta: number;
  isDefault: boolean;
}

export interface OptionGroupView {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: OptionView[];
}

export interface ItemDetail extends Omit<MenuCard, 'categoryId' | 'hasOptions'> {
  category: { id: string; name: string; kind: string };
  ingredients: string[];
  rating: { average: number | null; count: number };
  optionGroups: OptionGroupView[];
}

export interface Branch {
  id: string;
  slug: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  opensAt: string;
  closesAt: string;
  isOpen: boolean;
  distanceKm: number | null;
  deliversHere: boolean | null;
  deliveryFeeSatang: number;
}

export interface CartLine {
  lineId: string;
  menuItemId: string | null;
  name: string;
  imageUrl: string | null;
  categoryKind: string | null;
  qty: number;
  unitPriceSatang: number;
  lineTotalSatang: number;
  calories: number;
  optionIds: string[];
  optionNames: string[];
  layers: { id: string; name: string; color: string | null; shape: string | null }[];
  note: string | null;
  issue: { code: string; message: string } | null;
}

export interface Eta {
  readyAt: string;
  deliveredAt: string | null;
  prepMinutes: number;
  queueMinutes: number;
  kitchenBusy: boolean;
}

export interface CartView {
  id: string;
  branchId: string;
  channel: Channel;
  tableNo: string | null;
  promoCode: string | null;
  itemCount: number;
  lines: CartLine[];
  subtotalSatang: number;
  campaignDiscounts: { campaignId: string; name: string; amountSatang: number }[];
  promo: { code: string; valid: boolean; message: string; discountSatang: number } | null;
  discountSatang: number;
  deliverySatang: number;
  grandTotalSatang: number;
  issues: { lineId?: string; code: string; message: string }[];
  distanceKm: number | null;
  eta: Eta | null;
}

export interface Suggestion extends MenuCard {
  reasonCode: string;
  reason: string;
  pairedOrders: number;
}

export interface OrderView {
  id: string;
  number: string;
  publicToken: string;
  status: OrderStatus;
  channel: Channel;
  fulfillment: {
    type: FulfillmentType;
    tableNo: string | null;
    address: { label: string; line1: string; lat: number; lng: number } | null;
    scheduledAt: string | null;
  };
  branch: { id: string; name: string; address: string; lat: number; lng: number };
  note: string | null;
  items: {
    id: string;
    menuItemId: string | null;
    name: string;
    imageUrl: string | null;
    qty: number;
    options: string[];
    layers: string[];
    unitPriceSatang: number;
    lineTotalSatang: number;
  }[];
  totals: { subtotalSatang: number; discountSatang: number; deliverySatang: number; grandTotalSatang: number };
  promoCode: string | null;
  crownsEarned: number;
  eta: { readyAt: string | null; deliveredAt: string | null };
  payment: {
    id: string;
    method: PaymentMethod;
    status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED' | 'REFUNDED';
    amountSatang: number;
    qrPayload: string | null;
    redirectUrl: string | null;
    expiresAt: string | null;
  } | null;
  events: { status: OrderStatus; at: string; note: string | null }[];
  review: { rating: number; comment: string | null; reply: string | null } | null;
  canCancel: boolean;
  createdAt: string;
}

export interface BuilderIngredient {
  id: string;
  name: string;
  nameEn: string;
  kind: 'BUN' | 'PATTY' | 'CHEESE' | 'VEG' | 'SAUCE' | 'EXTRA';
  priceSatang: number;
  calories: number;
  color: string | null;
  shape: string | null;
  inStock: boolean;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details: unknown };
}
