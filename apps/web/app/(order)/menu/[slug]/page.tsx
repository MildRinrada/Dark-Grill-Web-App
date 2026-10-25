import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { ProductView } from '@/components/menu/product-view';
import { getItem } from '@/lib/server-api';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const item = await getItem(slug, 'br_siam');
  return item ? { title: item.name, description: item.description } : { title: 'ไม่พบเมนู' };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const branchId = (await cookies()).get('branch')?.value ?? 'br_siam';
  const item = await getItem(slug, branchId);
  if (!item) notFound();
  return <ProductView item={item} />;
}
