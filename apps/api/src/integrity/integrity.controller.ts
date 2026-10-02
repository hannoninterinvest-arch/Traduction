import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../common/auth';
import { IntegrityService } from './integrity.service';

@ApiTags('integrity')
@ApiBearerAuth()
@Controller()
export class IntegrityController {
  constructor(private readonly integrity: IntegrityService) {}

  @Post('verify')
  verify(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.integrity.verify(user.id, body);
  }

  @Get('audit')
  audit(@CurrentUser() user: AuthUser) {
    return this.integrity.audit(user.id);
  }

  @Post('integrity/anchor')
  anchor(@CurrentUser() user: AuthUser) {
    return this.integrity.anchorLatest(user.id);
  }
}
