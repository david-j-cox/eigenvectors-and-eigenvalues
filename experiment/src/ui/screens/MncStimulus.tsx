import type { Compound } from '../../engine/mnc';

/**
 * One compound, drawn.
 *
 * The four dimensions have to be readable simultaneously and independently,
 * which constrains how they are drawn. Size is the outer figure's extent;
 * hue is its fill; shape is circle against square; the line runs horizontally
 * or vertically across it. The line is a fixed near-black rather than a
 * contrasting colour, so hue cannot be read off the line instead of the
 * figure, which would collapse two dimensions into one.
 *
 * The hues are Okabe-Ito blue and orange. They carry the same lightness, so
 * the dimension survives greyscale printing badly on purpose: a lightness
 * difference would let hue be judged by brightness, and the grey pair this
 * replaced was not reliably discriminable at this size anyway.
 */
export function MncStimulus({ compound, size = 104 }: { compound: Compound; size?: number }) {
  const [shape, sizeBit, orientation, hue] = compound;
  const box = size;
  const extent = sizeBit === 0 ? box * 0.82 : box * 0.56; // large : small
  const fill = hue === 0 ? '#0072B2' : '#E69F00'; // Okabe-Ito blue : orange
  const c = box / 2;
  const half = extent / 2;
  const lineLen = extent * 0.72;
  const lineW = Math.max(3, extent * 0.085);

  return (
    <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} aria-hidden="true">
      {shape === 0 ? (
        <circle cx={c} cy={c} r={half} fill={fill} />
      ) : (
        <rect x={c - half} y={c - half} width={extent} height={extent} fill={fill} />
      )}
      {orientation === 0 ? (
        <rect
          x={c - lineLen / 2} y={c - lineW / 2}
          width={lineLen} height={lineW} fill="#12161A"
        />
      ) : (
        <rect
          x={c - lineW / 2} y={c - lineLen / 2}
          width={lineW} height={lineLen} fill="#12161A"
        />
      )}
    </svg>
  );
}
