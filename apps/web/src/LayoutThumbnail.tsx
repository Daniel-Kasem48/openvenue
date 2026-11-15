import { memo } from 'react';
import type { Venue } from '@openvenue/contracts';

export const LayoutThumbnail = memo(
  function LayoutThumbnail({ venue }: { venue: Venue }) {
    const floor = venue.layout.floors[0];
    return (
      <svg
        className="venue-art h-36 w-full bg-canvas p-3"
        viewBox={`0 0 ${floor.width} ${floor.depth}`}
        aria-hidden="true"
        focusable="false"
      >
        {[...floor.objects, ...floor.resources].map((item) => {
          const transform = `rotate(${item.rotation} ${item.x} ${item.y})`;
          return item.kind === 'plant' || ('shape' in item && item.shape === 'round') ? (
            <ellipse
              key={item.id}
              cx={item.x}
              cy={item.y}
              rx={item.width / 2}
              ry={item.depth / 2}
              fill={item.color}
              transform={transform}
            />
          ) : (
            <rect
              key={item.id}
              x={item.x - item.width / 2}
              y={item.y - item.depth / 2}
              width={item.width}
              height={item.depth}
              fill={item.color}
              transform={transform}
            />
          );
        })}
      </svg>
    );
  },
  (previous, next) =>
    previous.venue.id === next.venue.id && previous.venue.revision === next.venue.revision,
);
