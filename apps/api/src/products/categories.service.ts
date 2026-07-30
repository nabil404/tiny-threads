import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { ErrorCode } from '@tiny-threads/shared';
import { TenantDbService } from '../db/tenant-db.service';
import { Category } from '../db/entities/categories.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import {
  CodedBadRequestException,
  CodedNotFoundException,
} from '../common/errors/coded-exceptions';

export interface CategoryTreeNode {
  id: string;
  tenantId: string;
  name: string;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  children: CategoryTreeNode[];
}

@Injectable()
export class CategoriesService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly cls: ClsService,
  ) {}

  async create(dto: CreateCategoryDto): Promise<Category> {
    return this.tenantDb.run(async (em) => {
      const tenantId = this.cls.get<string>('tenantId');
      if (dto.parentId) {
        const parent = await em.findOne(Category, {
          where: { id: dto.parentId },
        });
        if (!parent) {
          throw new CodedNotFoundException(
            ErrorCode.RESOURCE_NOT_FOUND,
            `Parent category with ID ${dto.parentId} not found`,
          );
        }
      }
      const category = em.create(Category, {
        tenantId,
        name: dto.name,
        parentId: dto.parentId ?? null,
      });
      return em.save(category);
    });
  }

  async getCategoryTree(): Promise<CategoryTreeNode[]> {
    return this.tenantDb.run(async (em) => {
      const allCategories = await em.find(Category);
      const categoryMap = new Map<string, CategoryTreeNode>();

      allCategories.forEach((cat) => {
        categoryMap.set(cat.id, { ...cat, children: [] });
      });

      const rootNodes: CategoryTreeNode[] = [];

      categoryMap.forEach((node) => {
        if (node.parentId && categoryMap.has(node.parentId)) {
          categoryMap.get(node.parentId)!.children.push(node);
        } else {
          rootNodes.push(node);
        }
      });

      return rootNodes;
    });
  }

  async findById(id: string): Promise<Category> {
    return this.tenantDb.run(async (em) => {
      const category = await em.findOne(Category, {
        where: { id },
        relations: { children: true },
      });
      if (!category) {
        throw new CodedNotFoundException(
          ErrorCode.RESOURCE_NOT_FOUND,
          `Category with ID ${id} not found`,
        );
      }
      return category;
    });
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    return this.tenantDb.run(async (em) => {
      const category = await em.findOne(Category, { where: { id } });
      if (!category) {
        throw new CodedNotFoundException(
          ErrorCode.RESOURCE_NOT_FOUND,
          `Category with ID ${id} not found`,
        );
      }

      if (dto.parentId !== undefined) {
        if (dto.parentId === id) {
          throw new CodedBadRequestException(
            ErrorCode.VALIDATION_FAILED,
            'A category cannot be its own parent',
          );
        }

        if (dto.parentId !== null) {
          let currentParentId: string | null = dto.parentId;
          const visited = new Set<string>();

          while (currentParentId) {
            if (currentParentId === id) {
              throw new CodedBadRequestException(
                ErrorCode.VALIDATION_FAILED,
                'Cannot set a descendant category as parent',
              );
            }
            if (visited.has(currentParentId)) {
              break;
            }
            visited.add(currentParentId);

            const parent: Category | null = await em.findOne(Category, {
              where: { id: currentParentId },
            });
            if (!parent) {
              if (currentParentId === dto.parentId) {
                throw new CodedNotFoundException(
                  ErrorCode.RESOURCE_NOT_FOUND,
                  `Parent category with ID ${dto.parentId} not found`,
                );
              }
              break;
            }
            currentParentId = parent.parentId;
          }
        }
        category.parentId = dto.parentId;
      }

      if (dto.name !== undefined) {
        category.name = dto.name;
      }

      return em.save(category);
    });
  }

  async delete(id: string): Promise<void> {
    return this.tenantDb.run(async (em) => {
      const category = await em.findOne(Category, {
        where: { id },
        relations: { children: true },
      });
      if (!category) {
        throw new CodedNotFoundException(
          ErrorCode.RESOURCE_NOT_FOUND,
          `Category with ID ${id} not found`,
        );
      }

      if (category.children && category.children.length > 0) {
        throw new CodedBadRequestException(
          ErrorCode.VALIDATION_FAILED,
          'Cannot delete category with sub-categories. Remove or reassign children first.',
        );
      }

      await em.remove(category);
    });
  }
}
