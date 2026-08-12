/* eslint-disable @typescript-eslint/unbound-method */
import { StorefrontProductsController } from '../controllers/storefront-products.controller';
import { StorefrontCategoriesController } from '../controllers/storefront-categories.controller';
import { ProductsService } from '../services/products.service';
import { CategoriesService } from '../services/categories.service';

describe('Storefront Controllers', () => {
  let productsController: StorefrontProductsController;
  let categoriesController: StorefrontCategoriesController;
  let productsService: jest.Mocked<ProductsService>;
  let categoriesService: jest.Mocked<CategoriesService>;

  beforeEach(() => {
    productsService = {
      findStorefrontProducts: jest.fn(),
      findStorefrontProductById: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
    } as unknown as jest.Mocked<ProductsService>;

    categoriesService = {
      getCategoryTree: jest.fn(),
      findById: jest.fn(),
    } as unknown as jest.Mocked<CategoriesService>;

    productsController = new StorefrontProductsController(productsService);
    categoriesController = new StorefrontCategoriesController(
      categoriesService,
    );
  });

  describe('StorefrontProductsController', () => {
    it('calls productsService.findStorefrontProducts', async () => {
      const mockResult = { items: [], total: 0, page: 1, limit: 20 };
      productsService.findStorefrontProducts.mockResolvedValue(mockResult);

      const query = { page: 1, limit: 20 };
      const result = await productsController.findAll(query);

      expect(productsService.findStorefrontProducts).toHaveBeenCalledWith(
        query,
      );
      expect(result).toBe(mockResult);
    });

    it('calls productsService.findStorefrontProductById', async () => {
      const mockProduct = {
        id: 'prod-123',
        title: 'Test Product',
        status: 'active',
      } as any;
      productsService.findStorefrontProductById.mockResolvedValue(mockProduct);

      const result = await productsController.findOne('prod-123');

      expect(productsService.findStorefrontProductById).toHaveBeenCalledWith(
        'prod-123',
      );
      expect(result).toBe(mockProduct);
    });
  });

  describe('StorefrontCategoriesController', () => {
    it('calls categoriesService.getCategoryTree', async () => {
      const mockTree = [{ id: 'cat-1', name: 'Shirts', children: [] }] as any;
      categoriesService.getCategoryTree.mockResolvedValue(mockTree);

      const result = await categoriesController.getTree();

      expect(categoriesService.getCategoryTree).toHaveBeenCalled();
      expect(result).toBe(mockTree);
    });

    it('calls categoriesService.findById with id', async () => {
      const mockCategory = { id: 'cat-123', name: 'Shirts' } as any;
      categoriesService.findById.mockResolvedValue(mockCategory);

      const result = await categoriesController.findOne('cat-123');

      expect(categoriesService.findById).toHaveBeenCalledWith('cat-123');
      expect(result).toBe(mockCategory);
    });
  });
});
