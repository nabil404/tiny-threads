import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { withTenant } from './tenant-db';

@Injectable()
export class TenantDbService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cls: ClsService,
  ) {}

  run<T>(work: (manager: EntityManager) => Promise<T>): Promise<T>;
  run<T>(
    tenantId: string,
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T>;
  run<T>(
    tenantIdOrWork: string | ((manager: EntityManager) => Promise<T>),
    work?: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    if (typeof tenantIdOrWork === 'string') {
      const tenantId = tenantIdOrWork;
      const fn = work!;
      return this.cls.run(() => {
        this.cls.set('tenantId', tenantId);
        return withTenant(this.dataSource, this.cls, fn);
      });
    }
    return withTenant(this.dataSource, this.cls, tenantIdOrWork);
  }
}
