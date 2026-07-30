import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';

@ApiTags('Storefront Categories')
@Controller('categories')
export class StorefrontCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @ApiOperation({
    summary: 'Get category tree',
    description: 'Returns the full hierarchical category tree for storefront navigation.',
  })
  @ApiResponse({ status: 200, description: 'Hierarchical category tree.' })
  @Get()
  getTree() {
    return this.categoriesService.getCategoryTree();
  }

  @ApiOperation({
    summary: 'Get category by ID',
    description: 'Retrieves a single category by ID with its immediate children.',
  })
  @ApiResponse({ status: 200, description: 'Category found.' })
  @ApiResponse({ status: 404, description: 'Category not found.' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.categoriesService.findById(id);
  }
}
