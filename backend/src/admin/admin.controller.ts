import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { AdminService } from './admin.service';
import { ChangeRoleDto } from './dto/change-role.dto';
import { UsersQueryDto } from './dto/users-query.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/users')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  getUsers(@Query() query: UsersQueryDto) {
    return this.admin.getUsers(query);
  }

  @Patch(':id/role')
  changeRole(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ChangeRoleDto,
  ) {
    return this.admin.changeRole(user.id, id, dto.role);
  }
}
