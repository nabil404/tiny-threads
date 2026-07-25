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

  run<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return withTenant(this.dataSource, this.cls, work);
  }
}
