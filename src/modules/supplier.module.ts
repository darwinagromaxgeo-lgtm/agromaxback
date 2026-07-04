import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SupplierDocument, SupplierSchema } from '../infrastructure/database/mongodb/schemas/supplier.schema';
import { MongoSupplierRepository } from '../infrastructure/database/mongodb/repositories/mongo-supplier.repository';
import { SUPPLIER_REPOSITORY } from '../domain/repositories/supplier.repository';
import { CreateSupplierUseCase } from '../application/use-cases/supplier/create-supplier.use-case';
import { GetSuppliersUseCase } from '../application/use-cases/supplier/get-suppliers.use-case';
import { GetSupplierByRucUseCase } from '../application/use-cases/supplier/get-supplier-by-ruc.use-case';
import { SupplierController } from '../presentation/controllers/supplier.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: SupplierDocument.name, schema: SupplierSchema }])],
  controllers: [SupplierController],
  providers: [{ provide: SUPPLIER_REPOSITORY, useClass: MongoSupplierRepository }, CreateSupplierUseCase, GetSuppliersUseCase, GetSupplierByRucUseCase],
  exports: [SUPPLIER_REPOSITORY],
})
export class SupplierModule {}
