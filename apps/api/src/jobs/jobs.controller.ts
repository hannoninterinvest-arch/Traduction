import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../common/auth';
import { JobsService } from './jobs.service';

@ApiTags('jobs')
@ApiBearerAuth()
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.jobs.create(user.id, body);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.jobs.list(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.jobs.get(user.id, id);
  }

  @Post(':id/retry')
  retry(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.jobs.retry(user.id, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.jobs.remove(user.id, id);
  }

  @Patch(':id/pages/:pageId/blocks/:blockId')
  updateBlock(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('pageId') pageId: string,
    @Param('blockId') blockId: string,
    @Body() body: unknown,
  ) {
    return this.jobs.updateBlock(user.id, id, pageId, blockId, body);
  }
}
