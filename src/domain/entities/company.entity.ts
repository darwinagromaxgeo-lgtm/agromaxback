export interface CompanyBankAccount {
  bank: string;
  currency: 'PEN' | 'USD';
  accountNumber: string;
  cci?: string;
  holder: string;
  isActive: boolean;
}

export interface CompanyEntity {
  id?: string;
  name: string;
  ruc: string;
  address?: string;
  phone?: string;
  bankAccounts?: CompanyBankAccount[];
  bankAccountsRevision?: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
