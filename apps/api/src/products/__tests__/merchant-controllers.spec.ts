import { MerchantProductsController } from '../controllers/merchant-products.controller';
import { MerchantCategoriesController } from '../controllers/merchant-categories.controller';
import {
  ProductsService,
  PaginatedProducts,
} from '../services/products.service';
import {
  CategoriesService,
  CategoryTreeNode,
} from '../services/categories.service';
import { CreateProductDto } from '../dto/create-product.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { ProductQueryDto } from '../dto/product-query.dto';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { UpdateCategoryDto } from '../dto/update-category.dto';
import { Product } from '../../db/entities/products.entity';
import { Category } from '../../db/entities/categories.entity';

describe('Merchant Controllers', () => {
  let productsController: MerchantProductsController;
  let categoriesController: MerchantCategoriesController;
  let productsService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let categoriesService: {
    create: jest.Mock;
    getCategoryTree: jest.Mock;
    findById: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(() => {
    productsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    categoriesService = {
      create: jest.fn(),
      getCategoryTree: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    productsController = new MerchantProductsController(
      productsService as unknown as ProductsService,
    );
    categoriesController = new MerchantCategoriesController(
      categoriesService as unknown as CategoriesService,
    );
  });

  describe('MerchantProductsController', () => {
    it('calls productsService.create on POST', async () => {
      const dto: CreateProductDto = { title: 'Tee', status: 'active' };
      const expected = { id: 'p1', title: 'Tee', status: 'active' } as Product;
      productsService.create.mockResolvedValue(expected);

      const res = await productsController.create(dto);
      expect(productsService.create).toHaveBeenCalledWith(dto);
      expect(res).toBe(expected);
    });

    it('calls productsService.findAll on GET with includeDrafts=false', async () => {
      const query: ProductQueryDto = { page: 1, limit: 10 };
      const expected: PaginatedProducts = {
        items: [],
        total: 0,
        page: 1,
        limit: 10,
      };
      productsService.findAll.mockResolvedValue(expected);

      const res = await productsController.findAll(query);
      expect(productsService.findAll).toHaveBeenCalledWith(query, false);
      expect(res).toBe(expected);
    });

    it('calls productsService.findById on GET :id with includeDrafts=false', async () => {
      const expected = { id: 'p1', title: 'Tee' } as Product;
      productsService.findById.mockResolvedValue(expected);

      const res = await productsController.findOne('p1');
      expect(productsService.findById).toHaveBeenCalledWith('p1', false);
      expect(res).toBe(expected);
    });

    it('calls productsService.update on PATCH :id', async () => {
      const dto: UpdateProductDto = { title: 'Updated Tee' };
      const expected = { id: 'p1', title: 'Updated Tee' } as Product;
      productsService.update.mockResolvedValue(expected);

      const res = await productsController.update('p1', dto);
      expect(productsService.update).toHaveBeenCalledWith('p1', dto);
      expect(res).toBe(expected);
    });

    it('calls productsService.delete on DELETE :id', async () => {
      productsService.delete.mockResolvedValue(undefined);

      await productsController.remove('p1');
      expect(productsService.delete).toHaveBeenCalledWith('p1');
    });
  });

  describe('MerchantCategoriesController', () => {
    it('calls categoriesService.create on POST', async () => {
      const dto: CreateCategoryDto = { name: 'Apparel' };
      const expected = { id: 'c1', name: 'Apparel' } as Category;
      categoriesService.create.mockResolvedValue(expected);

      const res = await categoriesController.create(dto);
      expect(categoriesService.create).toHaveBeenCalledWith(dto);
      expect(res).toBe(expected);
    });

    it('calls categoriesService.getCategoryTree on GET', async () => {
      const expected = [
        { id: 'c1', name: 'Apparel', children: [] },
      ] as CategoryTreeNode[];
      categoriesService.getCategoryTree.mockResolvedValue(expected);

      const res = await categoriesController.getTree();
      expect(categoriesService.getCategoryTree).toHaveBeenCalled();
      expect(res).toBe(expected);
    });

    it('calls categoriesService.findById on GET :id', async () => {
      const expected = { id: 'c1', name: 'Apparel' } as Category;
      categoriesService.findById.mockResolvedValue(expected);

      const res = await categoriesController.findOne('c1');
      expect(categoriesService.findById).toHaveBeenCalledWith('c1');
      expect(res).toBe(expected);
    });

    it('calls categoriesService.update on PATCH :id', async () => {
      const dto: UpdateCategoryDto = { name: 'Clothing' };
      const expected = { id: 'c1', name: 'Clothing' } as Category;
      categoriesService.update.mockResolvedValue(expected);

      const res = await categoriesController.update('c1', dto);
      expect(categoriesService.update).toHaveBeenCalledWith('c1', dto);
      expect(res).toBe(expected);
    });

    it('calls categoriesService.delete on DELETE :id', async () => {
      categoriesService.delete.mockResolvedValue(undefined);

      await categoriesController.remove('c1');
      expect(categoriesService.delete).toHaveBeenCalledWith('c1');
    });
  });
});
