import { Injectable, Inject, NotFoundException, ConflictException } from '@nestjs/common';
import { ICategoryRepository, CATEGORY_REPOSITORY } from '../../../domain/repositories/category.repository';
import { UpdateCategoryDto } from '../../dtos/category/update-category.dto';

@Injectable()
export class UpdateCategoryUseCase {
  constructor(
    @Inject(CATEGORY_REPOSITORY) private readonly categoryRepository: ICategoryRepository,
  ) {}

  async execute(id: string, dto: UpdateCategoryDto) {
    if (dto.name) {
      const current = await this.categoryRepository.findById(id);
      if (!current) throw new NotFoundException('Categoría no encontrada');
      const parentId = dto.parentId !== undefined ? dto.parentId : current.parentId;
      const all = await this.categoryRepository.findAll();
      const duplicate = all.find(c => {
        if (c.id === id) return false;
        const sameName = c.name.toLowerCase() === dto.name!.toLowerCase();
        const bothTopLevel = !c.parentId && !parentId;
        const sameParent = !!c.parentId && !!parentId && c.parentId === parentId;
        return sameName && (bothTopLevel || sameParent);
      });
      if (duplicate) throw new ConflictException('Ya existe una categoría con ese nombre en este nivel');
    }
    const category = await this.categoryRepository.update(id, dto);
    if (!category) throw new NotFoundException('Categoría no encontrada');
    return category;
  }
}
