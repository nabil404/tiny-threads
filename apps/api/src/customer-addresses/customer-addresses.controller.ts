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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CustomerAddressesService } from './customer-addresses.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { SetDefaultAddressDto } from './dto/set-default-address.dto';
import { CustomerJwtAuthGuard } from '../customers/guards/customer-jwt-auth.guard';
import { CustomerAccessTokenPayload } from '../auth-core/services/token.service';

@ApiTags('Customer Addresses')
@ApiBearerAuth()
@ApiResponse({ status: 401, description: 'Missing or invalid access token.' })
@Controller('customers/me/addresses')
@UseGuards(CustomerJwtAuthGuard)
export class CustomerAddressesController {
  constructor(private readonly addressesService: CustomerAddressesService) {}

  @ApiOperation({
    summary: 'List saved addresses',
    description:
      'Returns all addresses belonging to the authenticated customer, newest first.',
  })
  @ApiResponse({ status: 200, description: 'The customer address list.' })
  @Get()
  async getAddresses(@Req() req: Request) {
    const { sub: customerId } = req.user as CustomerAccessTokenPayload;
    return this.addressesService.getAddresses(customerId);
  }

  @ApiOperation({
    summary: 'Get an address by ID',
    description:
      'Retrieves a single address belonging to the authenticated customer.',
  })
  @ApiResponse({ status: 200, description: 'Address found.' })
  @ApiResponse({ status: 404, description: 'Address not found.' })
  @Get(':id')
  async getAddressById(@Req() req: Request, @Param('id') addressId: string) {
    const { sub: customerId } = req.user as CustomerAccessTokenPayload;
    return this.addressesService.getAddressById(customerId, addressId);
  }

  @ApiOperation({
    summary: 'Create an address',
    description:
      "Adds a new address to the authenticated customer's address book.",
  })
  @ApiResponse({ status: 201, description: 'Address created successfully.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @Post()
  async createAddress(@Req() req: Request, @Body() dto: CreateAddressDto) {
    const { sub: customerId } = req.user as CustomerAccessTokenPayload;
    return this.addressesService.createAddress(customerId, dto);
  }

  @ApiOperation({
    summary: 'Update an address',
    description: 'Updates one or more fields of an existing address.',
  })
  @ApiResponse({ status: 200, description: 'Address updated successfully.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({ status: 404, description: 'Address not found.' })
  @Patch(':id')
  async updateAddress(
    @Req() req: Request,
    @Param('id') addressId: string,
    @Body() dto: UpdateAddressDto,
  ) {
    const { sub: customerId } = req.user as CustomerAccessTokenPayload;
    return this.addressesService.updateAddress(customerId, addressId, dto);
  }

  @ApiOperation({
    summary: 'Delete an address',
    description: "Removes an address from the customer's address book.",
  })
  @ApiResponse({ status: 200, description: 'Address deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Address not found.' })
  @Delete(':id')
  async deleteAddress(@Req() req: Request, @Param('id') addressId: string) {
    const { sub: customerId } = req.user as CustomerAccessTokenPayload;
    await this.addressesService.deleteAddress(customerId, addressId);
    return { success: true };
  }

  @ApiOperation({
    summary: 'Set an address as default',
    description:
      'Marks the address as the default shipping and/or billing address, clearing the flag on the customer’s other addresses.',
  })
  @ApiResponse({ status: 201, description: 'Default flags updated.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({ status: 404, description: 'Address not found.' })
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
