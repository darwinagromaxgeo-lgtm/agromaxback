import { AccountingRead } from '../../common/decorators/accounting-access.decorator';
import { SellerAccess } from '../../common/decorators/seller-access.decorator';
import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { CreateCategoryUseCase } from '../../application/use-cases/category/create-category.use-case';
import { GetCategoriesUseCase } from '../../application/use-cases/category/get-categories.use-case';
import { UpdateCategoryUseCase } from '../../application/use-cases/category/update-category.use-case';
import { DeleteCategoryUseCase } from '../../application/use-cases/category/delete-category.use-case';
import { CreateCategoryDto } from '../../application/dtos/category/create-category.dto';
import { UpdateCategoryDto } from '../../application/dtos/category/update-category.dto';

@ApiTags('Categories')
@ApiBearerAuth('JWT')
@AccountingRead()
@Controller('categories')
export class CategoryController {
  constructor(
    private readonly createCategory: CreateCategoryUseCase,
    private readonly getCategories: GetCategoriesUseCase,
    private readonly updateCategory: UpdateCategoryUseCase,
    private readonly deleteCategoryUseCase: DeleteCategoryUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear categoría', description: 'Registra una nueva categoría de producto' })
  async create(@Body() dto: CreateCategoryDto) {
    return this.createCategory.execute(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar categorías', description: 'Obtiene todas las categorías registradas' })
  @SellerAccess()
  async findAll() {
    return this.getCategories.execute();
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar categoría', description: 'Modifica los datos de una categoría existente' })
  @ApiParam({ name: 'id', description: 'ID de la categoría' })
  async update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.updateCategory.execute(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar categoría', description: 'Elimina permanentemente una categoría' })
  @ApiParam({ name: 'id', description: 'ID de la categoría' })
  async remove(@Param('id') id: string) {
    return this.deleteCategoryUseCase.execute(id);
  }
}
