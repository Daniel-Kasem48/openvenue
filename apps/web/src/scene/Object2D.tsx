import type { SceneObject } from '@openvenue/contracts';
export function Object2D({ object: o }: { object: SceneObject }) {
  const w = o.width,
    d = o.depth;
  return (
    <>
      {o.kind === 'plant' ? (
        <>
          <circle r={Math.min(w, d) * 0.4} fill="#b8a087" />
          {[0, 1, 2, 3, 4].map((i) => (
            <ellipse
              key={i}
              rx={w * 0.18}
              ry={d * 0.35}
              transform={'rotate(' + i * 72 + ') translate(0 ' + d * 0.12 + ')'}
              fill={i % 2 ? o.color : '#8fae79'}
              stroke="#587450"
              strokeWidth=".025"
            />
          ))}
        </>
      ) : (
        <rect
          x={-w / 2}
          y={-d / 2}
          width={w}
          height={d}
          rx={['sofa', 'car'].includes(o.kind) ? 0.2 : 0.03}
          fill={o.color}
          stroke="#64736c"
          strokeWidth=".035"
        />
      )}
      {o.kind === 'sofa' && (
        <>
          <rect
            x={-w / 2 + 0.12}
            y={-d / 2 + 0.12}
            width={w - 0.24}
            height={d * 0.55}
            rx=".12"
            fill="#d5bea7"
          />
          <path
            d={'M 0 ' + (-d / 2 + 0.12) + ' v ' + d * 0.55}
            stroke={o.color}
            strokeWidth=".05"
          />
        </>
      )}
      {o.kind === 'car' && (
        <>
          <rect
            x={-w * 0.38}
            y={-d * 0.19}
            width={w * 0.76}
            height={d * 0.43}
            rx=".2"
            fill="#294955"
          />
          <rect
            x={-w * 0.34}
            y={-d * 0.08}
            width={w * 0.68}
            height={d * 0.22}
            rx=".1"
            fill={o.color}
          />
          {[-1, 1].map((x) => (
            <rect
              key={x}
              x={x * w * 0.28 - w * 0.1}
              y={-d * 0.44}
              width={w * 0.2}
              height=".09"
              rx=".02"
              fill="#fff4cd"
            />
          ))}
        </>
      )}
      {['stairs', 'ramp'].includes(o.kind) &&
        Array.from({ length: 8 }, (_, i) => (
          <path
            key={i}
            d={'M ' + -w / 2 + ' ' + (-d / 2 + (i * d) / 8) + ' h ' + w}
            stroke="#d8ded6"
            strokeWidth=".035"
          />
        ))}
      {o.kind === 'counter' && (
        <rect
          x={-w * 0.47}
          y={-d * 0.4}
          width={w * 0.94}
          height={d * 0.8}
          fill="#e5dcc6"
          rx=".02"
        />
      )}
      {o.kind === 'door' && (
        <path d={'M ' + -w / 2 + ' ' + -d / 2 + ' h ' + w} stroke="#d4e9e5" strokeWidth=".1" />
      )}
    </>
  );
}
