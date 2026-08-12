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
import { CustomerJwtAuthGuard } from './guards/customer-jwt-auth.guard';
import { CustomersAvatarService } from './customers-avatar.service';
import type { CustomerAccessTokenPayload } from '../auth-core/services/token.service';

@ApiTags('Customers Profile')
@ApiBearerAuth()
@UseGuards(CustomerJwtAuthGuard)
@Controller('customers')
export class CustomersAvatarController {
  constructor(
    private readonly customersAvatarService: CustomersAvatarService,
  ) {}

  @ApiOperation({
    summary: 'Upload customer avatar image',
    description:
      'Uploads and processes an avatar image for the authenticated customer.',
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
    const { sub: customerId } = req.user as CustomerAccessTokenPayload;
    return this.customersAvatarService.uploadAvatar(customerId, file);
  }

  @ApiOperation({
    summary: 'Delete customer avatar image',
    description:
      'Deletes the avatar image for the authenticated customer and removes it from storage.',
  })
  @Delete('me/avatar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAvatar(@Req() req: Request): Promise<void> {
    const { sub: customerId } = req.user as CustomerAccessTokenPayload;
    await this.customersAvatarService.deleteAvatar(customerId);
  }
}
