import { Injectable, Inject, ConflictException } from '@nestjs/common';
import { ICompanyRepository, COMPANY_REPOSITORY } from '../../../domain/repositories/company.repository';
import { CreateCompanyDto } from '../../dtos/company/create-company.dto';

@Injectable()
export class CreateCompanyUseCase {
  constructor(@Inject(COMPANY_REPOSITORY) private readonly companyRepository: ICompanyRepository) {}

  async execute(dto: CreateCompanyDto) {
    const existing = await this.companyRepository.findByRuc(dto.ruc);
    if (existing) throw new ConflictException('RUC already registered');
    return this.companyRepository.create({ ...dto, isActive: true });
  }
}
