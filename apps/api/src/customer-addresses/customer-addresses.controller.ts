import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CustomerAddressesService } from './customer-addresses.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { SetDefaultAddressDto } from './dto/set-default-address.dto';
import { CustomerJwtAuthGuard } from '../customers/guards/customer-jwt-auth.guard';
import { CustomerAccessTokenPayload } from '../auth-core/services/token.service';

@Controller('customers/me/addresses')
@UseGuards(CustomerJwtAuthGuard)
export class CustomerAddressesController {
  constructor(private readonly addressesService: CustomerAddressesService) {}

  @Get()
  async getAddresses(@Req() req: Request) {
    const { sub: customerId } = req.user as CustomerAccessTokenPayload;
    return this.addressesService.getAddresses(customerId);
  }

  @Get(':id')
  async getAddressById(
    @Req() req: Request,
    @Param('id') addressId: string,
  ) {
    const { sub: customerId } = req.user as CustomerAccessTokenPayload;
    return this.addressesService.getAddressById(customerId, addressId);
  }

  @Post()
  async createAddress(
    @Req() req: Request,
    @Body() dto: CreateAddressDto,
  ) {
    const { sub: customerId } = req.user as CustomerAccessTokenPayload;
    return this.addressesService.createAddress(customerId, dto);
  }

  @Patch(':id')
  async updateAddress(
    @Req() req: Request,
    @Param('id') addressId: string,
    @Body() dto: UpdateAddressDto,
  ) {
    const { sub: customerId } = req.user as CustomerAccessTokenPayload;
    return this.addressesService.updateAddress(customerId, addressId, dto);
  }

  @Delete(':id')
  async deleteAddress(
    @Req() req: Request,
    @Param('id') addressId: string,
  ) {
    const { sub: customerId } = req.user as CustomerAccessTokenPayload;
    await this.addressesService.deleteAddress(customerId, addressId);
    return { success: true };
  }

  @Post(':id/default')
  async setDefault(
    @Req() req: Request,
    @Param('id') addressId: string,
    @Body() dto: SetDefaultAddressDto,
  ) {
    const { sub: customerId } = req.user as CustomerAccessTokenPayload;
    return this.addressesService.setDefaultFlags(customerId, addressId, {
      defaultShipping: dto.defaultShipping,
      defaultBilling: dto.defaultBilling,
    });
  }
}
