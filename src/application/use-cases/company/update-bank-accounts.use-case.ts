import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { COMPANY_REPOSITORY, ICompanyRepository } from '../../../domain/repositories/company.repository';
import { UpdateCompanyBankAccountsDto } from '../../dtos/company/update-bank-accounts.dto';

@Injectable()
export class UpdateCompanyBankAccountsUseCase {
  constructor(@Inject(COMPANY_REPOSITORY) private readonly companies: ICompanyRepository) {}

  async execute(id: string, dto: UpdateCompanyBankAccountsDto) {
    if (!await this.companies.findById(id)) throw new NotFoundException('Empresa no encontrada');
    const company = await this.companies.updateBankAccounts(id, dto.accounts, dto.expectedRevision);
    if (!company) throw new ConflictException('Otro administrador actualizó las cuentas. Vuelve a cargar la empresa antes de guardar');
    return company;
  }
}
