import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ICreditAccountRepository, CREDIT_ACCOUNT_REPOSITORY } from '../../../domain/repositories/credit-account.repository';
import { IClientRepository, CLIENT_REPOSITORY } from '../../../domain/repositories/client.repository';
import { IPaymentMethodRepository, PAYMENT_METHOD_REPOSITORY } from '../../../domain/repositories/payment-method.repository';
import { ICashRegisterRepository, CASH_REGISTER_REPOSITORY } from '../../../domain/repositories/cash-register.repository';
import { OpenCashRegisterUseCase } from '../cash-register/open-cash-register.use-case';
import { RegisterBatchPaymentDto } from '../../dtos/credit-account/register-batch-payment.dto';

const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class RegisterBatchPaymentUseCase {
  constructor(
    @Inject(CREDIT_ACCOUNT_REPOSITORY) private readonly creditRepo: ICreditAccountRepository,
    @Inject(CLIENT_REPOSITORY) private readonly clientRepo: IClientRepository,
    @Inject(PAYMENT_METHOD_REPOSITORY) private readonly paymentMethodRepo: IPaymentMethodRepository,
    @Inject(CASH_REGISTER_REPOSITORY) private readonly cashRegisterRepo: ICashRegisterRepository,
    private readonly openCashRegister: OpenCashRegisterUseCase,
  ) {}

  async execute(dto: RegisterBatchPaymentDto, userId?: string) {
    const paymentMethod = await this.paymentMethodRepo.findById(dto.paymentMethodId);
    if (!paymentMethod) throw new BadRequestException('Método de pago no encontrado');

    const register = await this.openCashRegister.execute({}, userId);
    const client = await this.clientRepo.findById(dto.clientId);
    const clientName = client?.name || dto.clientId;

    let allocations: { creditId: string; amount: number }[];

    if (dto.mode === 'EXPLICIT') {
      if (!dto.allocations || dto.allocations.length === 0)
        throw new BadRequestException('Se requieren asignaciones en modo EXPLICIT');
      allocations = dto.allocations;
    } else {
      if (!dto.totalAmount || dto.totalAmount <= 0)
        throw new BadRequestException('Se requiere totalAmount en modo FIFO');
      const openCredits = await this.creditRepo.findOpenByClientId(dto.clientId);
      openCredits.sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime());
      allocations = [];
      let remaining = round2(dto.totalAmount);
      for (const credit of openCredits) {
        if (remaining <= 0) break;
        const apply = round2(Math.min(credit.pendingAmount, remaining));
        if (apply <= 0) continue;
        allocations.push({ creditId: credit.id!, amount: apply });
        remaining = round2(remaining - apply);
      }
      if (allocations.length === 0) throw new BadRequestException('No hay créditos abiertos para este cliente');
    }

    const totalBatch = round2(allocations.reduce((s, a) => s + a.amount, 0));
    const paymentGroupId = new Types.ObjectId().toHexString();

    const results = [];
    for (const alloc of allocations) {
      const credit = await this.creditRepo.findById(alloc.creditId);
      if (!credit) throw new BadRequestException(`Crédito ${alloc.creditId} no encontrado`);
      if (credit.status === 'PAID') throw new BadRequestException(`El crédito ya está completamente pagado`);
      if (alloc.amount > credit.pendingAmount + 0.001)
        throw new BadRequestException(`El pago excede el monto pendiente. Máximo: ${credit.pendingAmount}`);

      const updatedRegister = await this.cashRegisterRepo.addEntry(register.id!, {
        type: 'INCOME',
        category: 'CREDIT_PAYMENT',
        description: `Pago crédito - ${clientName} [${paymentMethod.name}]`,
        amount: alloc.amount,
        referenceId: alloc.creditId,
        referenceType: 'CreditAccount',
        voucherType: 'NONE',
        isDeleted: false,
        editHistory: [],
        paymentGroupId,
        paymentGroupTotal: totalBatch,
        createdBy: userId,
      });

      const entries = updatedRegister?.entries || [];
      const entryId = entries[entries.length - 1]?.id;

      await this.creditRepo.addPayment(alloc.creditId, {
        amount: alloc.amount,
        paymentDate: new Date(),
        paymentMethod: dto.paymentMethodId,
        paymentMethodName: paymentMethod.name,
        cashRegisterEntryId: entryId,
        notes: dto.notes,
        receivedBy: userId,
      });

      const newPaidAmount = round2(credit.paidAmount + alloc.amount);
      const newPendingAmount = round2(credit.totalAmount - newPaidAmount);
      const newStatus = newPendingAmount <= 0 ? 'PAID' : 'PARTIAL';

      const updated = await this.creditRepo.update(alloc.creditId, {
        paidAmount: newPaidAmount,
        pendingAmount: newPendingAmount,
        status: newStatus,
      });
      results.push(updated);
    }

    return results;
  }
}
