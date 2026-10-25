// Illustrated burger layers drawn as SVG so they can be stacked, exploded and
// dropped in with transform-only animation. Shapes come from the ingredient's
// `builderShape`; colours from `builderColor`.

export type LayerShape = 'bun-top' | 'bun-bottom' | 'patty' | 'cheese' | 'leaf' | 'slice' | 'ring' | 'strip' | 'sauce' | 'egg';

/** Visual height of each layer in a 300-wide viewBox; also used to space the stack. */
export const LAYER_HEIGHT: Record<LayerShape, number> = {
  'bun-top': 104,
  'bun-bottom': 44,
  patty: 46,
  cheese: 28,
  leaf: 26,
  slice: 20,
  ring: 18,
  strip: 20,
  sauce: 12,
  egg: 26,
};

/** How much the next layer overlaps this one, so a stack reads as one burger. */
export const LAYER_OVERLAP: Record<LayerShape, number> = {
  'bun-top': 0,
  'bun-bottom': 6,
  patty: 8,
  cheese: 12,
  leaf: 8,
  slice: 5,
  ring: 5,
  strip: 5,
  sauce: 3,
  egg: 8,
};

function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + amount * 255)));
  const r = f(n >> 16);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r} ${g} ${b})`;
}

export function LayerSvg({ shape, color, className }: { shape: LayerShape; color: string; className?: string }) {
  const h = LAYER_HEIGHT[shape];
  const dark = shade(color, -0.18);
  const light = shade(color, 0.16);
  return (
    <svg viewBox={`0 0 300 ${h}`} className={className} aria-hidden focusable="false" overflow="visible">
      {shape === 'bun-top' && (
        <>
          <path d="M14 96 C14 34 76 4 150 4 C224 4 286 34 286 96 Q286 104 276 104 L24 104 Q14 104 14 96 Z" fill={color} />
          <path
            d="M40 58 C60 26 104 14 150 14 C196 14 240 26 260 58"
            stroke={light}
            strokeWidth="10"
            strokeLinecap="round"
            fill="none"
            opacity="0.55"
          />
          {[
            [92, 34, -20],
            [130, 26, 10],
            [170, 30, -8],
            [206, 40, 24],
            [70, 56, 30],
            [118, 50, -12],
            [158, 52, 18],
            [198, 62, -26],
            [236, 64, 12],
            [96, 72, 6],
            [140, 74, -30],
            [178, 78, 20],
          ].map(([x, y, r], i) => (
            <ellipse key={i} cx={x} cy={y} rx="6" ry="3.2" fill="#FFF3DC" transform={`rotate(${r} ${x} ${y})`} />
          ))}
          <path d="M14 96 Q150 112 286 96 L286 98 Q286 104 276 104 L24 104 Q14 104 14 98 Z" fill={dark} />
        </>
      )}
      {shape === 'bun-bottom' && (
        <>
          <path d="M18 6 L282 6 Q288 6 288 14 L284 28 C276 40 252 44 228 44 L72 44 C48 44 24 40 16 28 L12 14 Q12 6 18 6 Z" fill={color} />
          <path d="M18 6 L282 6 Q288 6 288 12 L18 12 Q12 12 12 12 Q12 6 18 6 Z" fill={light} opacity="0.7" />
        </>
      )}
      {shape === 'patty' && (
        <>
          <path
            d="M16 12 C16 4 30 2 50 3 L250 3 C270 2 284 4 284 12 L286 32 C286 42 268 45 248 44 L52 44 C32 45 14 42 14 32 Z"
            fill={color}
          />
          {[60, 104, 148, 192, 236].map((x) => (
            <path key={x} d={`M${x} 10 l18 26`} stroke={dark} strokeWidth="5" strokeLinecap="round" opacity="0.8" />
          ))}
          <path d="M22 10 Q150 0 278 10" stroke={light} strokeWidth="3" fill="none" opacity="0.5" />
        </>
      )}
      {shape === 'cheese' && (
        <path
          d="M8 4 L292 4 L292 12 L262 12 L250 26 L238 12 L178 12 L170 22 L162 12 L98 12 L84 28 L72 12 L8 12 Z"
          fill={color}
          stroke={dark}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      )}
      {shape === 'leaf' && (
        <path
          d="M4 10 C20 0 34 22 52 10 C70 -2 84 22 102 10 C120 -2 134 22 152 10 C170 -2 184 22 202 10 C220 -2 234 22 252 10 C270 -2 284 22 296 10 L292 20 C276 26 24 26 8 20 Z"
          fill={color}
          stroke={dark}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      )}
      {shape === 'slice' && (
        <>
          {[58, 150, 242].map((x) => (
            <g key={x}>
              <ellipse cx={x} cy="10" rx="50" ry="9" fill={color} />
              <ellipse cx={x} cy="9" rx="34" ry="5" fill={light} opacity="0.55" />
            </g>
          ))}
        </>
      )}
      {shape === 'ring' && (
        <>
          {[52, 116, 184, 248].map((x) => (
            <ellipse key={x} cx={x} cy="9" rx="38" ry="7" fill="none" stroke={color} strokeWidth="5" />
          ))}
        </>
      )}
      {shape === 'strip' && (
        <>
          <path
            d="M6 8 C46 -2 70 18 110 8 C150 -2 174 18 214 8 C246 0 270 14 294 8 L294 16 C270 22 246 8 214 16 C174 26 150 6 110 16 C70 26 46 6 6 16 Z"
            fill={color}
          />
          <path d="M10 11 C46 4 70 18 110 11 C150 4 174 18 214 11 C246 6 270 14 290 11" stroke={light} strokeWidth="2" fill="none" />
        </>
      )}
      {shape === 'sauce' && (
        <path
          d="M10 4 L290 4 L290 6 C270 6 266 12 256 11 C240 10 238 5 220 6 L120 6 C108 6 104 12 92 11 C78 10 74 6 10 6 Z"
          fill={color}
          stroke={color}
          strokeWidth="4"
          strokeLinejoin="round"
        />
      )}
      {shape === 'egg' && (
        <>
          <path
            d="M30 14 C30 2 80 2 120 4 C170 0 270 2 270 14 C270 26 200 26 150 25 C100 26 30 26 30 14 Z"
            fill={color}
            stroke={shade('#FFF6EC', -0.1)}
            strokeWidth="1.5"
          />
          <ellipse cx="160" cy="12" rx="30" ry="9" fill="#FFB020" />
          <ellipse cx="152" cy="9" rx="10" ry="3" fill="#FFE08A" />
        </>
      )}
    </svg>
  );
}

/** Maps an ingredient's builder shape to the layers it draws (a bun is top + bottom). */
export function shapeOf(shape: string | null | undefined): LayerShape {
  const known: LayerShape[] = ['patty', 'cheese', 'leaf', 'slice', 'ring', 'strip', 'sauce', 'egg'];
  return known.includes(shape as LayerShape) ? (shape as LayerShape) : 'slice';
}
