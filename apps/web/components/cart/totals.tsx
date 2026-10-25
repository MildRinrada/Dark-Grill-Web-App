import { baht } from '@/lib/format';
import type { CartView } from '@/lib/types';

export function Totals({ cart, showDelivery }: { cart: CartView; showDelivery?: boolean }) {
  return (
    <dl className="flex flex-col gap-2 text-[15px]">
      <div className="flex justify-between">
        <dt className="text-muted">ค่าอาหาร</dt>
        <dd className="tabular">{baht(cart.subtotalSatang)}</dd>
      </div>
      {cart.campaignDiscounts.map((c) => (
        <div key={c.campaignId} className="flex justify-between text-success">
          <dt>{c.name}</dt>
          <dd className="tabular">-{baht(c.amountSatang)}</dd>
        </div>
      ))}
      {cart.promo?.valid && (
        <div className="flex justify-between text-success">
          <dt>โค้ด {cart.promo.code}</dt>
          <dd className="tabular">-{baht(cart.promo.discountSatang)}</dd>
        </div>
      )}
      {showDelivery && (
        <div className="flex justify-between">
          <dt className="text-muted">ค่าส่ง{cart.distanceKm !== null ? ` (${cart.distanceKm} กม.)` : ''}</dt>
          <dd className="tabular">{cart.deliverySatang ? baht(cart.deliverySatang) : 'คำนวณเมื่อเลือกที่อยู่'}</dd>
        </div>
      )}
      <div className="mt-2 flex items-baseline justify-between border-t border-line pt-3">
        <dt className="font-bold">ยอดสุทธิ</dt>
        <dd className="tabular text-2xl font-bold">{baht(cart.grandTotalSatang)}</dd>
      </div>
    </dl>
  );
}
