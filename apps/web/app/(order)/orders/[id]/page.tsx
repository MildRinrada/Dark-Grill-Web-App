import type { Metadata } from 'next';
import { OrderTracking } from '@/components/order/order-view';

export const metadata: Metadata = { title: 'ติดตามออเดอร์' };

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const [{ id }, { t }] = await Promise.all([params, searchParams]);
  return <OrderTracking id={id} token={t} />;
}
