import type { Compound } from '../../engine/mnc';

/**
 * One compound, drawn.
 *
 * The four dimensions have to be readable simultaneously and independently,
 * which constrains how they are drawn. Size is the outer figure's extent;
 * brightness is its fill; shape is circle against square; the line runs
 * horizontally or vertically across it. The line is drawn in a fixed colour
 * rather than a contrasting one so that Shade cannot be read off the line
 * instead of the figure, which would make two dimensions one.
 */
export function MncStimulus({ compound, size = 104 }: { compound: Compound; size?: number }) {
  const [shape, sizeBit, orientation, brightness] = compound;
  const box = size;
  const extent = sizeBit === 0 ? box * 0.82 : box * 0.56; // large : small
  const fill = brightness === 0 ? '#6E6E6E' : '#A0A0A0'; // dark : light
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
