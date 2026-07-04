import { Injectable, Inject } from '@nestjs/common';
import { IAccountPayableRepository, ACCOUNT_PAYABLE_REPOSITORY } from '../../../domain/repositories/account-payable.repository';
import { AccountPayableInstallment } from '../../../domain/entities/account-payable.entity';

@Injectable()
export class CreateAccountPayableUseCase {
  constructor(
    @Inject(ACCOUNT_PAYABLE_REPOSITORY) private readonly apRepository: IAccountPayableRepository,
  ) {}

  async execute(data: {
    purchaseId: string;
    supplier: string;
    totalAmount: number;
    paymentScheduleType: 'SINGLE_DATE' | 'INSTALLMENTS' | 'PENDIENTE_ACUERDO';
    dueDate?: Date;
    installments?: { amount: number; dueDate: Date }[];
    currency?: 'PEN' | 'USD';
    totalAmountPen?: number;
    isHistorical?: boolean;
    userId?: string;
  }) {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const installments: AccountPayableInstallment[] = data.paymentScheduleType === 'INSTALLMENTS' && data.installments
      ? data.installments.map(i => ({
          amount: i.amount,
          dueDate: i.dueDate,
          status: (data.isHistorical && i.dueDate < todayStart) ? 'PAID' as const : 'PENDING' as const,
        }))
      : [];

    const autoPaid = Math.round(installments.filter(i => i.status === 'PAID').reduce((s, i) => s + i.amount, 0) * 100) / 100;
    const pendingAmount = Math.round((data.totalAmount - autoPaid) * 100) / 100;
    const status = pendingAmount <= 0 ? 'PAID' : autoPaid > 0 ? 'PARTIAL' : 'PENDING';

    return this.apRepository.create({
      purchaseId: data.purchaseId,
      supplier: data.supplier,
      totalAmount: data.totalAmount,
      paidAmount: autoPaid,
      pendingAmount,
      status,
      paymentScheduleType: data.paymentScheduleType,
      dueDate: data.dueDate,
      installments,
      payments: [],
      currency: data.currency || 'PEN',
      totalAmountPen: data.totalAmountPen,
      createdBy: data.userId,
    });
  }
}
