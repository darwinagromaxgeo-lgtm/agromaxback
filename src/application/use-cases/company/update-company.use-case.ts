import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { ICompanyRepository, COMPANY_REPOSITORY } from '../../../domain/repositories/company.repository';
import { UpdateCompanyDto } from '../../dtos/company/update-company.dto';

@Injectable()
export class UpdateCompanyUseCase {
  constructor(@Inject(COMPANY_REPOSITORY) private readonly companyRepository: ICompanyRepository) {}

  async execute(id: string, dto: UpdateCompanyDto) {
    const company = await this.companyRepository.update(id, dto);
    if (!company) throw new NotFoundException('Empresa no encontrada');
    return company;
  }
}
