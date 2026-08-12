import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { MerchantAdminJwtAuthGuard } from './guards/merchant-admin-jwt-auth.guard';
import { MerchantAdminAvatarService } from './merchant-admin-avatar.service';
import type { MerchantAdminAccessTokenPayload } from '../auth-core/services/token.service';

@ApiTags('Merchant Admins Profile')
@ApiBearerAuth()
@UseGuards(MerchantAdminJwtAuthGuard)
@Controller('merchant-admins')
export class MerchantAdminAvatarController {
  constructor(
    private readonly merchantAdminAvatarService: MerchantAdminAvatarService,
  ) {}

  @ApiOperation({
    summary: 'Upload merchant admin avatar image',
    description:
      'Uploads and processes an avatar image for the authenticated merchant admin user.',
  })
  @ApiConsumes('multipart/form-data')
  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('avatar', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  uploadAvatar(
    @Req() req: Request,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const { sub: userId } = req.user as MerchantAdminAccessTokenPayload;
    return this.merchantAdminAvatarService.uploadAvatar(userId, file);
  }

  @ApiOperation({
    summary: 'Delete merchant admin avatar image',
    description:
      'Deletes the avatar image for the authenticated merchant admin user and removes it from storage.',
  })
  @Delete('me/avatar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAvatar(@Req() req: Request): Promise<void> {
    const { sub: userId } = req.user as MerchantAdminAccessTokenPayload;
    await this.merchantAdminAvatarService.deleteAvatar(userId);
  }
}
