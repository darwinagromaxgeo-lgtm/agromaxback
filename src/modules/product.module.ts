import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductDocument, ProductSchema } from '../infrastructure/database/mongodb/schemas/product.schema';
import { MongoProductRepository } from '../infrastructure/database/mongodb/repositories/mongo-product.repository';
import { PRODUCT_REPOSITORY } from '../domain/repositories/product.repository';
import { CreateProductUseCase } from '../application/use-cases/product/create-product.use-case';
import { GetProductsUseCase } from '../application/use-cases/product/get-products.use-case';
import { UpdateProductUseCase } from '../application/use-cases/product/update-product.use-case';
import { DeleteProductUseCase } from '../application/use-cases/product/delete-product.use-case';
import { GetPriceFloorAlertsUseCase } from '../application/use-cases/product/get-price-floor-alerts.use-case';
import { ImportProductsUseCase } from '../application/use-cases/product/import-products.use-case';
import { ProductController } from '../presentation/controllers/product.controller';
import { StockModule } from './stock.module';
import { StockMovementModule } from './stock-movement.module';
import { CloudinaryModule } from '../infrastructure/cloudinary/cloudinary.module';
import { CategoryModule } from './category.module';
import { UnitModule } from './unit.module';

@Module({
  imports: [MongooseModule.forFeature([{ name: ProductDocument.name, schema: ProductSchema }]), StockModule, StockMovementModule, CloudinaryModule, CategoryModule, UnitModule],
  controllers: [ProductController],
  providers: [{ provide: PRODUCT_REPOSITORY, useClass: MongoProductRepository }, CreateProductUseCase, GetProductsUseCase, UpdateProductUseCase, DeleteProductUseCase, GetPriceFloorAlertsUseCase, ImportProductsUseCase],
  exports: [PRODUCT_REPOSITORY],
})
export class ProductModule {}
