// EMVCo merchant-presented QR payload for Thai PromptPay (dynamic, with amount).

const field = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`;

function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function target(id: string): string {
  const digits = id.replace(/\D/g, '');
  if (digits.length >= 13) return field('02', digits); // national id / tax id
  return field('01', `0066${digits.replace(/^0/, '')}`.padStart(13, '0')); // mobile number
}

export function promptPayPayload(receiverId: string, amountSatang: number): string {
  const body =
    field('00', '01') +
    field('01', '12') +
    field('29', field('00', 'A000000677010111') + target(receiverId)) +
    field('53', '764') +
    field('54', (amountSatang / 100).toFixed(2)) +
    field('58', 'TH') +
    '6304';
  return body + crc16(body);
}
