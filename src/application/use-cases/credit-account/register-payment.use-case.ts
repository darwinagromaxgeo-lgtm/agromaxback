import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { ICreditAccountRepository, CREDIT_ACCOUNT_REPOSITORY } from '../../../domain/repositories/credit-account.repository';
import { IClientRepository, CLIENT_REPOSITORY } from '../../../domain/repositories/client.repository';
import { IPaymentMethodRepository, PAYMENT_METHOD_REPOSITORY } from '../../../domain/repositories/payment-method.repository';
import { RegisterPaymentDto } from '../../dtos/credit-account/register-payment.dto';
import { OpenCashRegisterUseCase } from '../cash-register/open-cash-register.use-case';
import { AddEntryUseCase } from '../cash-register/add-entry.use-case';
import { CashRegisterEntryType, CashRegisterEntryCategory } from '../../../domain/enums';

@Injectable()
export class RegisterPaymentUseCase {
  constructor(
    @Inject(CREDIT_ACCOUNT_REPOSITORY) private readonly creditRepository: ICreditAccountRepository,
    @Inject(CLIENT_REPOSITORY) private readonly clientRepository: IClientRepository,
    @Inject(PAYMENT_METHOD_REPOSITORY) private readonly paymentMethodRepository: IPaymentMethodRepository,
    private readonly openCashRegister: OpenCashRegisterUseCase,
    private readonly addCashEntry: AddEntryUseCase,
  ) {}

  async execute(creditId: string, dto: RegisterPaymentDto, userId?: string) {
    const credit = await this.creditRepository.findById(creditId);
    if (!credit) throw new BadRequestException('Cuenta de crédito no encontrada');
    if (credit.status === 'PAID') throw new BadRequestException('El crédito ya está completamente pagado');
    if (dto.amount > credit.pendingAmount) throw new BadRequestException(`El pago excede el monto pendiente. Máximo: ${credit.pendingAmount}`);

    const paymentMethod = await this.paymentMethodRepository.findById(dto.paymentMethodId);
    if (!paymentMethod) throw new BadRequestException('Método de pago no encontrado');

    const register = await this.openCashRegister.execute({}, userId);
    const clientName = await this.clientRepository.findById(credit.clientId).then(c => c?.name || credit.clientId);
    const updatedRegister = await this.addCashEntry.execute(register.id!, {
      type: CashRegisterEntryType.INCOME,
      category: CashRegisterEntryCategory.CREDIT_PAYMENT,
      description: `Pago credito - ${clientName} [${paymentMethod.name}]`,
      amount: dto.amount,
      referenceId: creditId,
      referenceType: 'CreditAccount',
    }, userId);

    const entryId = updatedRegister?.entries?.[updatedRegister.entries.length - 1]?.id;

    await this.creditRepository.addPayment(creditId, {
      amount: dto.amount,
      paymentDate: new Date(),
      paymentMethod: dto.paymentMethodId,
      paymentMethodName: paymentMethod.name,
      cashRegisterEntryId: entryId,
      notes: dto.notes,
      receivedBy: userId,
    });

    const newPaidAmount = credit.paidAmount + dto.amount;
    const newPendingAmount = credit.totalAmount - newPaidAmount;
    const newStatus = newPendingAmount <= 0 ? 'PAID' : 'PARTIAL';

    return this.creditRepository.update(creditId, {
      paidAmount: Math.round(newPaidAmount * 100) / 100,
      pendingAmount: Math.round(newPendingAmount * 100) / 100,
      status: newStatus,
    });
  }
}
