import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

/** Which business units a staff member may see when their data scope is "units". */
@Entity('user_business_units')
export class UserBusinessUnit {
  @PrimaryColumn('int', { name: 'userId' })
  userId: number;

  @PrimaryColumn('int', { name: 'businessUnitId' })
  businessUnitId: number;

  @CreateDateColumn()
  createdAt: Date;
}
