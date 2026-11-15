import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  createVenueSchema,
  patchVenueSchema,
  saveVenueSchema,
  type CreateVenueDto,
  type PatchVenueDto,
  type SaveVenueDto,
} from '../dto/venues.dto';
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ArchiveGuard, Roles, type AuthenticatedRequest } from '../../auth/guards/session.guard';
import { UuidPipe } from '../../../common/pipes/uuid.pipe';
import { VenuesService } from '../services/venues.service';

@Controller('venues')
export class VenuesController {
  constructor(@Inject(VenuesService) private readonly service: VenuesService) {}
  @Get() @UseGuards(ArchiveGuard) list(@Query() query: { includeArchived?: unknown }) {
    return this.service.list(query);
  }
  @Post() @Roles('owner', 'manager') create(
    @Body(new ZodValidationPipe(createVenueSchema)) input: CreateVenueDto,
  ) {
    return this.service.create(input);
  }
  @Patch(':id') @Roles('owner', 'manager') update(
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(patchVenueSchema)) input: PatchVenueDto,
  ) {
    return this.service.update(id, input);
  }
  @Put(':id') @Roles('owner', 'manager') saveLayout(
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(saveVenueSchema)) input: SaveVenueDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.saveLayout(id, input, req.principal);
  }
}
