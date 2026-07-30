import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ProductsModule } from '../products.module';
import { TenantDbService } from '../../db/tenant-db.service';
import { getDataSourceToken } from '@nestjs/typeorm';

describe('ProductsModule', () => {
  it('compiles successfully', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ProductsModule,
      ],
    })
      .overrideProvider(TenantDbService)
      .useValue({})
      .overrideProvider(getDataSourceToken())
      .useValue({})
      .compile();

    expect(moduleRef).toBeDefined();
  });
});
