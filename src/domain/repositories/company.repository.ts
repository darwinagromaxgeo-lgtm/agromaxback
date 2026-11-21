import { CompanyBankAccount, CompanyEntity } from '../entities/company.entity';

export interface ICompanyRepository {
  create(company: CompanyEntity): Promise<CompanyEntity>;
  findAll(): Promise<CompanyEntity[]>;
  findById(id: string): Promise<CompanyEntity | null>;
  update(id: string, company: Partial<CompanyEntity>): Promise<CompanyEntity | null>;
  updateBankAccounts(id: string, accounts: CompanyBankAccount[], expectedRevision: number): Promise<CompanyEntity | null>;
  delete(id: string): Promise<void>;
  findByRuc(ruc: string): Promise<CompanyEntity | null>;
}

export const COMPANY_REPOSITORY = 'COMPANY_REPOSITORY';
