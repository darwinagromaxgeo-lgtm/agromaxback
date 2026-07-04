import { Injectable, Inject, ConflictException } from '@nestjs/common';
import { ICategoryRepository, CATEGORY_REPOSITORY } from '../../../domain/repositories/category.repository';
import { CreateCategoryDto } from '../../dtos/category/create-category.dto';

@Injectable()
export class CreateCategoryUseCase {
  constructor(
    @Inject(CATEGORY_REPOSITORY) private readonly categoryRepository: ICategoryRepository,
  ) {}

  async execute(dto: CreateCategoryDto) {
    const allCategories = await this.categoryRepository.findAll();
    // Solo bloquea duplicados en el MISMO nivel: ambas top-level (sin parent) o mismo parentId.
    // Una subcategoría puede tener el mismo nombre que una categoría de otro nivel.
    const duplicate = allCategories.find(c => {
      const sameName = c.name.toLowerCase() === dto.name.toLowerCase();
      const bothTopLevel = !c.parentId && !dto.parentId;
      const sameParent = !!c.parentId && !!dto.parentId && c.parentId === dto.parentId;
      return sameName && (bothTopLevel || sameParent);
    });
    if (duplicate) throw new ConflictException('Ya existe una categoría con ese nombre en este nivel');
    return this.categoryRepository.create({ ...dto, isActive: true });
  }
}
