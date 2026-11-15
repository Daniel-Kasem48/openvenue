import { Inject, Injectable } from '@nestjs/common';
import type { OverviewRangeDto } from '../dto/overview.dto';
import { DatabaseService } from '../../database/database.service';
import { overview } from '../queries/queries';

@Injectable()
export class OverviewService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  async get(query: OverviewRangeDto) {
    const { from, to } = query;
    return await overview(this.db.em, from, to);
  }
}
