import type { OrderStatus } from './types';

export function baht(satang: number): string {
  const value = satang / 100;
  return `฿${value.toLocaleString('th-TH', { minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

export function clockTime(iso: string | Date | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
}

export function shortDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' });
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'รอชำระเงิน',
  EXPIRED: 'หมดเวลาชำระ',
  PAID: 'ชำระแล้ว รอครัวรับ',
  CANCELLED: 'ยกเลิกแล้ว',
  ACCEPTED: 'ครัวรับออเดอร์',
  PREPARING: 'กำลังย่าง',
  READY: 'พร้อมแล้ว',
  OUT_FOR_DELIVERY: 'กำลังไปส่ง',
  COMPLETED: 'สำเร็จ',
};

export const FULFILLMENT_LABEL = { DELIVERY: 'เดลิเวอรี', PICKUP: 'รับเองที่ร้าน', DINE_IN: 'ทานที่ร้าน' } as const;
export const PAYMENT_LABEL = { PROMPTPAY: 'พร้อมเพย์', CARD: 'บัตรเครดิต/เดบิต', CASH: 'เงินสดที่เคาน์เตอร์' } as const;

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: 'รอชำระ',
  SUCCEEDED: 'ชำระแล้ว',
  FAILED: 'ไม่สำเร็จ',
  EXPIRED: 'หมดเวลา',
  REFUNDED: 'คืนเงินแล้ว',
};
