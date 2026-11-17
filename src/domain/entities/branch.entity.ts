export interface BranchEntity {
  id?: string;
  code: string;
  name: string;
  address?: string;
  phone?: string;
  companyIds: string[];
  defaultCompanyId?: string;
  billingSeriesCode?: string;
  sunatEstablishmentCode?: string;
  isActive: boolean;
  isMain: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
