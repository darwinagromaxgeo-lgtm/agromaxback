import { Injectable, Inject } from '@nestjs/common';
import { ICompanyRepository, COMPANY_REPOSITORY } from '../../../domain/repositories/company.repository';

@Injectable()
export class DeleteCompanyUseCase {
  constructor(@Inject(COMPANY_REPOSITORY) private readonly repo: ICompanyRepository) {}
  async execute(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
