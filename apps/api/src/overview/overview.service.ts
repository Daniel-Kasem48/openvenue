import { Inject, Injectable } from '@nestjs/common';
import { overviewRangeSchema } from '@openvenue/contracts';
import { DatabaseService } from '../database/database.service';
import { overview } from './queries';

@Injectable()
export class OverviewService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  async get(query: Record<string, unknown>) {
    const { from, to } = overviewRangeSchema.parse(query);
    return await overview(this.db.em, from, to);
  }
}
