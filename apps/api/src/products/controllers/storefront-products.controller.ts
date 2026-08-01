import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ProductsService } from '../services/products.service';
import { ProductQueryDto } from '../dto/product-query.dto';

@ApiTags('Storefront Products')
@Controller('products')
export class StorefrontProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @ApiOperation({
    summary: 'List public products',
    description:
      'Returns a paginated list of active products for storefront viewers.',
  })
  @ApiResponse({ status: 200, description: 'Paginated active product list.' })
  @Get()
  findAll(@Query() query: ProductQueryDto) {
    return this.productsService.findAll(query, true);
  }

  @ApiOperation({
    summary: 'Get active product by ID',
    description:
      'Retrieves a single active product by ID for storefront viewers.',
  })
  @ApiResponse({ status: 200, description: 'Product found.' })
  @ApiResponse({ status: 404, description: 'Product not found or not active.' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findById(id, true);
  }
}
