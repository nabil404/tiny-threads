import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { MerchantAdminJwtAuthGuard } from '../merchant-admins/guards/merchant-admin-jwt-auth.guard';
import { RolesGuard } from '../merchant-admins/guards/roles.guard';
import { Roles } from '../merchant-admins/decorators/roles.decorator';
import { TenantSettingsService } from './tenant-settings.service';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';

@ApiTags('Merchant Settings')
@ApiBearerAuth()
@Controller('merchant-admins/settings')
@UseGuards(MerchantAdminJwtAuthGuard, RolesGuard)
export class TenantSettingsController {
  constructor(private readonly tenantSettingsService: TenantSettingsService) {}

  @ApiOperation({
    summary: 'Get tenant settings',
    description:
      'Retrieves the current tenant settings, creating default settings if none exist.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tenant settings retrieved successfully.',
  })
  @Roles('owner', 'admin')
  @Get()
  getSettings() {
    return this.tenantSettingsService.getSettings();
  }

  @ApiOperation({
    summary: 'Update tenant settings',
    description: 'Updates tenant settings such as guest checkout permission.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tenant settings updated successfully.',
  })
  @Roles('owner', 'admin')
  @Patch()
  updateSettings(@Body() dto: UpdateTenantSettingsDto) {
    return this.tenantSettingsService.updateSettings(dto);
  }
}
