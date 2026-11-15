import { Venue } from '../venues/entities/venue.entity';
import { Resource } from '../venues/entities/resource.entity';
import { Show } from '../events/entities/show.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { User } from '../accounts/entities/user.entity';
import { Session } from '../auth/entities/session.entity';
import { ShowPrice } from '../events/entities/show-price.entity';
import { EventSeatBlock } from '../events/entities/event-seat-block.entity';
import { AuditLog } from './entities/audit-log.entity';

// SQL migrations retain database checks and exclusion constraints.
export const entities = [
  Venue,
  Resource,
  Show,
  Booking,
  User,
  Session,
  ShowPrice,
  EventSeatBlock,
  AuditLog,
];
