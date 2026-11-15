import { expect, it } from 'vitest';
import { z } from 'zod';
import { ZodValidationPipe } from '../apps/api/src/common/pipes/zod-validation.pipe';
import {
  availabilityQuerySchema,
  bookingFiltersSchema,
} from '../apps/api/src/modules/bookings/dto/bookings.dto';

it('passes normalized query values and defaults to services', () => {
  const pipe = new ZodValidationPipe(bookingFiltersSchema);
  expect(pipe.transform({ limit: '12', q: '  Ada  ', ignored: 'value' })).toEqual({
    limit: 12,
    q: 'Ada',
    status: 'confirmed',
  });
  expect(pipe.transform({})).toEqual({ limit: 50, q: '', status: 'confirmed' });
  expect(() => pipe.transform({ limit: 'invalid' })).toThrow(z.ZodError);
});

it('preserves interval refinements when availability adds its event filter', () => {
  const pipe = new ZodValidationPipe(availabilityQuerySchema);
  const start = '2030-01-01T10:00:00Z';
  const end = '2030-01-01T11:00:00Z';
  expect(pipe.transform({ start, end })).toEqual({ start, end });
  expect(() => pipe.transform({ start, end: start })).toThrow(z.ZodError);
  expect(() => pipe.transform({ start, end: '2030-01-09T10:00:00Z' })).toThrow(z.ZodError);
  expect(() => pipe.transform({ start, end, showId: 'invalid' })).toThrow(z.ZodError);
});
