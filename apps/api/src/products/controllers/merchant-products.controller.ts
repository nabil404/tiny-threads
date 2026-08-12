import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiConsumes,
} from '@nestjs/swagger';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { MerchantAdminJwtAuthGuard } from '../../merchant-admins/guards/merchant-admin-jwt-auth.guard';
import { RolesGuard } from '../../merchant-admins/guards/roles.guard';
import { Roles } from '../../merchant-admins/decorators/roles.decorator';
import { ProductsService } from '../services/products.service';
import { CreateProductDto } from '../dto/create-product.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { ProductQueryDto } from '../dto/product-query.dto';
import { CodedBadRequestException } from '../../common/errors/coded-exceptions';
import { ErrorCode } from '@tiny-threads/shared';

@ApiTags('Merchant Products')
@ApiBearerAuth()
@Controller('merchant-admins/products')
@UseGuards(MerchantAdminJwtAuthGuard)
export class MerchantProductsController {
  constructor(private readonly productsService: ProductsService) {}

  private async validateDto<T extends object>(
    DtoClass: new () => T,
    plain: unknown,
  ): Promise<T> {
    const instance = plainToInstance(DtoClass, plain);
    const errors = await validate(instance);
    if (errors.length > 0) {
      throw new CodedBadRequestException(
        ErrorCode.VALIDATION_FAILED,
        errors
          .map((e) => Object.values(e.constraints ?? {}))
          .flat()
          .join('; '),
      );
    }
    return instance;
  }

  @ApiOperation({
    summary: 'Create a new product',
    description:
      'Creates a new product with optional inline variants, categories, and variant images. Accepts multipart/form-data.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Product created successfully.' })
  @UseGuards(MerchantAdminJwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Post()
  @UseInterceptors(
    AnyFilesInterceptor({ limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  async create(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: { data?: string },
  ) {
    if (!body.data) {
      throw new CodedBadRequestException(
        ErrorCode.VALIDATION_FAILED,
        'Missing required "data" field in multipart request',
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(body.data);
    } catch {
      throw new CodedBadRequestException(
        ErrorCode.VALIDATION_FAILED,
        'Invalid JSON in "data" field',
      );
    }

    const dto = await this.validateDto(CreateProductDto, parsed);

    // Map files to variant indices
    const variantImageFiles = new Map<number, Express.Multer.File[]>();
    if (files && files.length > 0) {
      for (const file of files) {
        const match = file.fieldname.match(/^variants\[(\d+)]\.images\[\d+]$/);
        if (match) {
          const idx = parseInt(match[1], 10);
          if (!variantImageFiles.has(idx)) variantImageFiles.set(idx, []);
          variantImageFiles.get(idx)!.push(file);
        }
      }
    }

    if (variantImageFiles.size > 0) {
      return this.productsService.createWithImages(dto, variantImageFiles);
    }
    return this.productsService.create(dto);
  }

  @ApiOperation({
    summary: 'List merchant products',
    description: 'Returns a paginated list of products including drafts.',
  })
  @ApiResponse({ status: 200, description: 'Paginated product list.' })
  @Get()
  findAll(@Query() query: ProductQueryDto) {
    return this.productsService.findAll(query, false);
  }

  @ApiOperation({
    summary: 'Get product by ID',
    description: 'Retrieves a single product by ID.',
  })
  @ApiResponse({ status: 200, description: 'Product found.' })
  @ApiResponse({ status: 404, description: 'Product not found.' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findById(id, false);
  }

  @ApiOperation({
    summary: 'Update product',
    description: 'Updates product details, options, variants, or categories.',
  })
  @ApiResponse({ status: 200, description: 'Product updated successfully.' })
  @ApiResponse({ status: 404, description: 'Product not found.' })
  @UseGuards(MerchantAdminJwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @ApiOperation({
    summary: 'Delete product',
    description: 'Deletes a product and its options and variants.',
  })
  @ApiResponse({ status: 204, description: 'Product deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Product not found.' })
  @UseGuards(MerchantAdminJwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.productsService.delete(id);
  }
}
