import { Injectable, Inject } from '@nestjs/common';
import { ICompanyRepository, COMPANY_REPOSITORY } from '../../../domain/repositories/company.repository';

@Injectable()
export class GetCompaniesUseCase {
  constructor(@Inject(COMPANY_REPOSITORY) private readonly companyRepository: ICompanyRepository) {}
  async execute() { return this.companyRepository.findAll(); }
}
