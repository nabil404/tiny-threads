import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { MerchantAdminJwtAuthGuard } from './guards/merchant-admin-jwt-auth.guard';
import { MerchantAdminLocaleService } from './merchant-admin-locale.service';
import {
  UpdateMerchantAdminLocaleDto,
  MerchantAdminLocaleResponseDto,
} from './dto/merchant-admin-locale.dto';
import type { MerchantAdminAccessTokenPayload } from '../auth-core/services/token.service';

@ApiTags('Merchant Admin Locale')
@ApiBearerAuth()
@Controller('merchant-admins/me/locale')
@UseGuards(MerchantAdminJwtAuthGuard)
export class MerchantAdminLocaleController {
  constructor(private readonly localeService: MerchantAdminLocaleService) {}

  @ApiOperation({
    summary: "Get the calling merchant admin's preferred locale",
  })
  @ApiResponse({ status: 200, type: MerchantAdminLocaleResponseDto })
  @Get()
  async getLocale(
    @Req() req: Request,
  ): Promise<MerchantAdminLocaleResponseDto> {
    const { sub } = req.user as MerchantAdminAccessTokenPayload;
    const locale = await this.localeService.getLocale(sub);
    return { locale };
  }

  @ApiOperation({
    summary: "Update the calling merchant admin's preferred locale",
  })
  @ApiResponse({ status: 200, type: MerchantAdminLocaleResponseDto })
  @Patch()
  async updateLocale(
    @Req() req: Request,
    @Body() dto: UpdateMerchantAdminLocaleDto,
  ): Promise<MerchantAdminLocaleResponseDto> {
    const { sub } = req.user as MerchantAdminAccessTokenPayload;
    const locale = await this.localeService.updateLocale(sub, dto.locale);
    return { locale };
  }
}
