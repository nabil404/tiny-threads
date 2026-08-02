import {
  Entity,
  Column,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { SoftDeletableTenantEntityBase } from './base';
import { Tenant } from './tenants.entity';

// Self-referential adjacency-list hierarchy; composite self-FK keeps a
// category's parent within the same tenant.
@Entity({ name: 'categories' })
@Index('categories_tenant_parent_idx', ['tenantId', 'parentId'])
export class Category extends SoftDeletableTenantEntityBase {
  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id', referencedColumnName: 'id' })
  tenant?: Tenant;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId!: string | null;

  // read-only; set parentId to write the FK
  @ManyToOne(() => Category, (category) => category.children, {
    nullable: true,
  })
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'parent_id', referencedColumnName: 'id' },
  ])
  parent?: Category | null;

  @OneToMany(() => Category, (category) => category.parent)
  children?: Category[];

  @Column({ type: 'text' })
  name!: string;
}
