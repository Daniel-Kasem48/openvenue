import { Injectable, type PipeTransform } from '@nestjs/common';
import { z } from 'zod';
@Injectable()
export class UuidPipe implements PipeTransform {
  transform(value: unknown) {
    return z.uuid().parse(value);
  }
}
