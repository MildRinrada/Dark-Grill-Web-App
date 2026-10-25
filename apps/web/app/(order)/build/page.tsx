import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Builder } from '@/components/burger/builder';
import { getBuilderIngredients } from '@/lib/server-api';
import type { BuilderIngredient } from '@/lib/types';

export const metadata: Metadata = { title: 'แต่งเบอร์เกอร์เอง' };

interface BuilderPayload {
  base: { menuItemId: string; priceSatang: number; calories: number; maxLayers: number };
  ingredients: BuilderIngredient[];
}

export default async function BuildPage() {
  const branchId = (await cookies()).get('branch')?.value ?? 'br_siam';
  const data = await getBuilderIngredients<BuilderPayload>(branchId);

  return (
    <div className="pt-6">
      <header className="mb-6">
        <h1 className="font-display-th text-4xl font-black leading-tight sm:text-5xl">แต่งเบอร์เกอร์เอง</h1>
        <p className="mt-2 max-w-[56ch] text-muted">เลือกขนมปัง แล้ววางเนื้อ ชีส ผัก และซอสทีละชั้น ราคาเริ่มต้นรวมขนมปังแล้ว</p>
      </header>
      {data ? (
        <Builder base={data.base} ingredients={data.ingredients} />
      ) : (
        <p className="py-20 text-center text-muted">โหลดวัตถุดิบไม่ได้ในตอนนี้ ลองรีเฟรชอีกครั้ง</p>
      )}
    </div>
  );
}
