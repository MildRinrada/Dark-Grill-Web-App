'use client';

import { CircleAlert, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { baht } from '@/lib/format';
import type { CartLine as Line } from '@/lib/types';
import { LayerSvg, shapeOf } from '../burger/layer';
import { QtyStepper } from '../menu/option-picker';

export function CartLine({
  line,
  onQty,
  onRemove,
  disabled,
}: {
  line: Line;
  onQty: (qty: number) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const isBuild = line.layers.length > 0;
  return (
    <li className="flex gap-4 py-4">
      <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-surface-2 sm:size-24">
        {isBuild ? (
          <div className="flex h-full flex-col justify-center gap-[1px] px-2" aria-hidden>
            <LayerSvg shape="bun-top" color={line.layers[0].color ?? '#E3A04F'} className="w-full" />
            {line.layers.slice(1, 5).map((l, i) => (
              <LayerSvg key={i} shape={shapeOf(l.shape)} color={l.color ?? '#999999'} className="-mt-1 w-full" />
            ))}
            <LayerSvg shape="bun-bottom" color={line.layers[0].color ?? '#E3A04F'} className="-mt-1 w-full" />
          </div>
        ) : line.imageUrl ? (
          <Image src={line.imageUrl} alt="" fill sizes="96px" className="object-cover" />
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <p className="font-semibold leading-snug">{line.name}</p>
          <p className="tabular shrink-0 font-bold">{baht(line.lineTotalSatang)}</p>
        </div>
        {(line.optionNames.length > 0 || isBuild) && (
          <p className="text-sm text-muted">{isBuild ? line.layers.map((l) => l.name).join(' · ') : line.optionNames.join(' · ')}</p>
        )}
        {line.issue && (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-danger">
            <CircleAlert aria-hidden className="size-4" />
            {line.issue.message}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
          <QtyStepper value={line.qty} onChange={onQty} size="sm" label={`จำนวน ${line.name}`} />
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="press inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-danger hover:bg-danger/10 disabled:opacity-50"
          >
            <Trash2 aria-hidden className="size-4" />
            ลบ
          </button>
        </div>
      </div>
    </li>
  );
}
