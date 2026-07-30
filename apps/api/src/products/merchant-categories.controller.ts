import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { MerchantAdminJwtAuthGuard } from '../merchant-admins/guards/merchant-admin-jwt-auth.guard';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('Merchant Categories')
@ApiBearerAuth()
@Controller('merchant-admins/categories')
@UseGuards(MerchantAdminJwtAuthGuard)
export class MerchantCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @ApiOperation({
    summary: 'Create a new category',
    description: 'Creates a category with an optional parent category.',
  })
  @ApiResponse({ status: 201, description: 'Category created successfully.' })
  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @ApiOperation({
    summary: 'Get category tree',
    description: 'Returns the full hierarchical category tree.',
  })
  @ApiResponse({ status: 200, description: 'Hierarchical category tree.' })
  @Get()
  getTree() {
    return this.categoriesService.getCategoryTree();
  }

  @ApiOperation({
    summary: 'Get category by ID',
    description:
      'Retrieves a single category by ID with its immediate children.',
  })
  @ApiResponse({ status: 200, description: 'Category found.' })
  @ApiResponse({ status: 404, description: 'Category not found.' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.categoriesService.findById(id);
  }

  @ApiOperation({
    summary: 'Update category',
    description: 'Updates category name or parent category ID.',
  })
  @ApiResponse({ status: 200, description: 'Category updated successfully.' })
  @ApiResponse({ status: 404, description: 'Category not found.' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @ApiOperation({
    summary: 'Delete category',
    description: 'Deletes a category if it has no sub-categories.',
  })
  @ApiResponse({ status: 204, description: 'Category deleted successfully.' })
  @ApiResponse({
    status: 400,
    description: 'Cannot delete category with sub-categories.',
  })
  @ApiResponse({ status: 404, description: 'Category not found.' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.categoriesService.delete(id);
  }
}
