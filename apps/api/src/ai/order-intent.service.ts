import { Injectable } from '@nestjs/common';
import type { Option, OptionGroup } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

const THAI_NUMBERS: Record<string, number> = {
  หนึ่ง: 1,
  นึง: 1,
  สอง: 2,
  สาม: 3,
  สี่: 4,
  ห้า: 5,
  หก: 6,
  เจ็ด: 7,
  แปด: 8,
  เก้า: 9,
  สิบ: 10,
};
const UNIT = '(?:อัน|ชิ้น|ที่|แก้ว|กล่อง|ชุด|ถุง|จาน|ลูก|pcs?)';
const NUMBER = `(\\d+|${Object.keys(THAI_NUMBERS).join('|')})`;
const SPLIT = /\s*(?:,|และ|แล้วก็|กับ|\+|\n|;)\s*/;
const SINGLE = /(อันนึง|อันหนึ่ง|1\s*อัน)/;

type Group = OptionGroup & { options: Option[] };

export interface DraftLine {
  menuItemId: string;
  name: string;
  qty: number;
  optionIds: string[];
  optionNames: string[];
  priceSatang: number;
}

/**
 * Turns a Thai order sentence into a draft cart, e.g.
 * "เอาชีสเบอร์เกอร์ 2 อัน อันนึงไม่ใส่หัวหอม เผ็ดน้อย".
 * Rule-based so it runs with no external model; the response is a draft the
 * customer confirms before anything reaches the cart. A Phase 3 LLM parser can
 * replace `parse` behind the same endpoint and response shape.
 */
@Injectable()
export class OrderIntentService {
  constructor(private readonly prisma: PrismaService) {}

  async parse(text: string) {
    const items = await this.prisma.menuItem.findMany({
      where: { isArchived: false },
      include: { optionGroups: { include: { options: true } } },
    });
    const matchers = items
      .flatMap((item) =>
        [item.name, item.nameEn, ...item.aliases].map((alias) => ({ alias: alias.toLowerCase().replace(/\s+/g, ''), item })),
      )
      .sort((a, b) => b.alias.length - a.alias.length);

    const lines: DraftLine[] = [];
    const unmatched: string[] = [];
    let last: (typeof items)[number] | null = null;

    for (const raw of text
      .split(SPLIT)
      .map((s) => s.trim())
      .filter(Boolean)) {
      const compact = raw.toLowerCase().replace(/\s+/g, '');
      const hit = matchers.find((m) => compact.includes(m.alias));
      const item = hit?.item ?? null;
      if (!item) {
        // A trailing modifier like ", เผ็ดน้อย" belongs to the previous item.
        if (last && lines.length && this.applyModifiers(lines[lines.length - 1], last.optionGroups, compact)) continue;
        unmatched.push(raw);
        continue;
      }
      last = item;
      const qty = this.quantity(raw);
      const singleAt = compact.search(SINGLE);
      const shared = singleAt >= 0 ? compact.slice(0, singleAt) : compact;
      const base = this.line(item, Math.max(1, qty));
      this.applyModifiers(base, item.optionGroups, shared.replace(hit!.alias, ''));

      if (singleAt >= 0 && qty > 1) {
        const special = { ...base, qty: 1, optionIds: [...base.optionIds], optionNames: [...base.optionNames] };
        this.applyModifiers(special, item.optionGroups, compact.slice(singleAt));
        base.qty = qty - 1;
        lines.push(base, special);
      } else {
        if (singleAt >= 0) this.applyModifiers(base, item.optionGroups, compact.slice(singleAt));
        lines.push(base);
      }
    }
    return { lines, unmatched, confirmRequired: true };
  }

  private quantity(segment: string): number {
    const withUnit = segment.match(new RegExp(`${NUMBER}\\s*${UNIT}`));
    const bare = segment.match(new RegExp(NUMBER));
    const token = withUnit?.[1] ?? bare?.[1];
    if (!token) return 1;
    const n = /^\d+$/.test(token) ? Number(token) : THAI_NUMBERS[token];
    return Math.min(20, Math.max(1, n ?? 1));
  }

  private line(item: { id: string; name: string; priceSatang: number; optionGroups: Group[] }, qty: number): DraftLine {
    const draft: DraftLine = { menuItemId: item.id, name: item.name, qty, optionIds: [], optionNames: [], priceSatang: item.priceSatang };
    for (const g of item.optionGroups.filter((g) => g.minSelect > 0)) {
      const def = g.options.find((o) => o.isDefault) ?? g.options[0];
      if (def) this.choose(draft, g, def);
    }
    return draft;
  }

  private applyModifiers(draft: DraftLine, groups: Group[], text: string): boolean {
    let applied = false;
    for (const g of groups) {
      for (const o of g.options) {
        if (this.mentions(text, o.name)) {
          this.choose(draft, g, o);
          applied = true;
        }
      }
    }
    return applied;
  }

  private mentions(text: string, optionName: string): boolean {
    const name = optionName.replace(/\s+/g, '');
    if (text.includes(name)) return true;
    const without = name.match(/^ไม่ใส่(.+)$/);
    if (without) return new RegExp(`ไม่(?:ใส่|เอา)${without[1]}`).test(text);
    const extra = name.match(/^เพิ่ม(.+)$/);
    if (extra) return new RegExp(`(?:เพิ่ม|เอา)${extra[1]}(?:เพิ่ม)?|${extra[1]}เพิ่ม`).test(text);
    return false;
  }

  private choose(draft: DraftLine, group: Group, option: Option) {
    const inGroup = new Set(group.options.map((o) => o.id));
    if (group.maxSelect === 1) {
      const keep = draft.optionIds.map((id, i) => ({ id, name: draft.optionNames[i] })).filter((x) => !inGroup.has(x.id));
      draft.optionIds = keep.map((x) => x.id);
      draft.optionNames = keep.map((x) => x.name);
    }
    if (!draft.optionIds.includes(option.id)) {
      draft.optionIds.push(option.id);
      draft.optionNames.push(option.name);
    }
  }
}
