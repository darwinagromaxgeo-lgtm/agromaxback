import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CategoryDocument, CategorySchema } from '../infrastructure/database/mongodb/schemas/category.schema';
import { MongoCategoryRepository } from '../infrastructure/database/mongodb/repositories/mongo-category.repository';
import { CATEGORY_REPOSITORY } from '../domain/repositories/category.repository';
import { CreateCategoryUseCase } from '../application/use-cases/category/create-category.use-case';
import { GetCategoriesUseCase } from '../application/use-cases/category/get-categories.use-case';
import { UpdateCategoryUseCase } from '../application/use-cases/category/update-category.use-case';
import { DeleteCategoryUseCase } from '../application/use-cases/category/delete-category.use-case';
import { CategoryController } from '../presentation/controllers/category.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: CategoryDocument.name, schema: CategorySchema }])],
  controllers: [CategoryController],
  providers: [
    { provide: CATEGORY_REPOSITORY, useClass: MongoCategoryRepository },
    CreateCategoryUseCase,
    GetCategoriesUseCase,
    UpdateCategoryUseCase,
    DeleteCategoryUseCase,
  ],
  exports: [CATEGORY_REPOSITORY],
})
export class CategoryModule {}
