import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { IPurchaseRepository, PURCHASE_REPOSITORY } from '../../../domain/repositories/purchase.repository';
import { IAccountPayableRepository, ACCOUNT_PAYABLE_REPOSITORY } from '../../../domain/repositories/account-payable.repository';
import { PurchaseEntity } from '../../../domain/entities/purchase.entity';
import { AccountPayableEntity } from '../../../domain/entities/account-payable.entity';
import { UpdatePurchaseDto } from '../../dtos/purchase/update-purchase.dto';
import { CreateAccountPayableUseCase } from '../account-payable/create-account-payable.use-case';

@Injectable()
export class UpdatePurchaseUseCase {
  constructor(
    @Inject(PURCHASE_REPOSITORY) private readonly purchaseRepository: IPurchaseRepository,
    @Inject(ACCOUNT_PAYABLE_REPOSITORY) private readonly apRepository: IAccountPayableRepository,
    private readonly createAccountPayable: CreateAccountPayableUseCase,
  ) {}

  async execute(id: string, dto: UpdatePurchaseDto) {
    const existing = await this.purchaseRepository.findById(id);
    if (!existing) throw new NotFoundException('Compra no encontrada');

    const ap = await this.apRepository.findByPurchaseId(id);

    const changingPayment =
      dto.paymentType !== undefined ||
      dto.paymentScheduleType !== undefined ||
      dto.dueDate !== undefined ||
      dto.installments !== undefined;

    if (changingPayment && ap) {
      if (ap.paidAmount > 0)
        throw new BadRequestException('No se puede modificar el tipo de pago: ya existen pagos registrados');
      if (ap.status === 'CONSOLIDATED')
        throw new BadRequestException('No se puede modificar: la cuenta está consolidada en un acuerdo de pago');
    }

    // Build purchase update payload
    const updateData: Partial<PurchaseEntity> & { [k: string]: any } = {};
    if (dto.supplier !== undefined) updateData.supplier = dto.supplier;
    if (dto.supplierId !== undefined) updateData.supplierId = dto.supplierId || undefined;
    if (dto.supplierRuc !== undefined) updateData.supplierRuc = dto.supplierRuc || undefined;
    if (dto.date !== undefined) updateData.date = new Date(dto.date);
    if (dto.documentType !== undefined) updateData.documentType = dto.documentType as any;
    if (dto.documentSeries !== undefined) updateData.documentSeries = dto.documentSeries || undefined;
    if (dto.documentNumber !== undefined) updateData.documentNumber = dto.documentNumber || undefined;
    if (dto.issueDate !== undefined) updateData.issueDate = dto.issueDate ? new Date(dto.issueDate) : undefined;

    if (changingPayment) {
      const newPaymentType = (dto.paymentType ?? existing.paymentType) as 'CONTADO' | 'CREDITO' | 'PENDIENTE_ACUERDO';
      updateData.paymentType = newPaymentType;

      if (newPaymentType === 'CONTADO') {
        if (ap) await this.apRepository.delete(ap.id!);
        updateData.paymentScheduleType = undefined; // triggers $unset in repo
        updateData.dueDate = undefined;             // triggers $unset in repo
      } else {
        const scheduleType = (
          newPaymentType === 'PENDIENTE_ACUERDO'
            ? 'PENDIENTE_ACUERDO'
            : (dto.paymentScheduleType ?? ap?.paymentScheduleType ?? 'SINGLE_DATE')
        ) as 'SINGLE_DATE' | 'INSTALLMENTS' | 'PENDIENTE_ACUERDO';

        updateData.paymentScheduleType = scheduleType as any;

        const isUsdPurchase = existing.totalCostUsd != null;
        const effectiveTotalUsd = dto.totalCostUsd ?? existing.totalCostUsd;
        const effectiveExchangeRate = dto.exchangeRate ?? existing.exchangeRate ?? 1;
        const effectiveTotalPen = isUsdPurchase
          ? Math.round(effectiveTotalUsd! * effectiveExchangeRate * 100) / 100
          : existing.totalCost;

        if (ap) {
          const apUpdate: Partial<AccountPayableEntity> = {
            paymentScheduleType: scheduleType,
            dueDate: scheduleType === 'SINGLE_DATE' && dto.dueDate
              ? new Date(dto.dueDate)
              : scheduleType === 'SINGLE_DATE' ? ap.dueDate : undefined,
            installments: scheduleType === 'INSTALLMENTS' && dto.installments
              ? dto.installments.map(i => ({ amount: i.amount, dueDate: new Date(i.dueDate), status: 'PENDING' as const }))
              : scheduleType !== 'INSTALLMENTS' ? [] : ap.installments,
          };
          if (isUsdPurchase && (dto.totalCostUsd !== undefined || dto.exchangeRate !== undefined)) {
            apUpdate.totalAmount = effectiveTotalUsd!;
            apUpdate.totalAmountPen = effectiveTotalPen;
            apUpdate.pendingAmount = effectiveTotalUsd!;
          }
          await this.apRepository.update(ap.id!, apUpdate);
        } else {
          // Switching from CONTADO → CREDITO/PENDIENTE_ACUERDO: create new AP
          await this.createAccountPayable.execute({
            purchaseId: id,
            supplier: dto.supplier ?? existing.supplier,
            totalAmount: isUsdPurchase ? effectiveTotalUsd! : existing.totalCost,
            paymentScheduleType: scheduleType,
            dueDate: scheduleType === 'SINGLE_DATE' && dto.dueDate ? new Date(dto.dueDate) : undefined,
            installments: scheduleType === 'INSTALLMENTS' && dto.installments
              ? dto.installments.map(i => ({ amount: i.amount, dueDate: new Date(i.dueDate) }))
              : undefined,
            currency: isUsdPurchase ? 'USD' : 'PEN',
            totalAmountPen: isUsdPurchase ? effectiveTotalPen : undefined,
          });
        }
      }
    }

    // Exchange rate update without payment type change (e.g., fix typo in TC)
    if (!changingPayment && (dto.totalCostUsd !== undefined || dto.exchangeRate !== undefined)) {
      const isUsdPurchase = existing.totalCostUsd != null;
      if (isUsdPurchase && ap && ap.paidAmount === 0) {
        const effectiveTotalUsd = dto.totalCostUsd ?? existing.totalCostUsd!;
        const effectiveExchangeRate = dto.exchangeRate ?? existing.exchangeRate ?? 1;
        const newTotalPen = Math.round(effectiveTotalUsd * effectiveExchangeRate * 100) / 100;
        updateData.totalCost = newTotalPen;
        updateData.totalCostUsd = effectiveTotalUsd;
        updateData.exchangeRate = effectiveExchangeRate;
        await this.apRepository.update(ap.id!, {
          totalAmount: effectiveTotalUsd,
          totalAmountPen: newTotalPen,
          pendingAmount: effectiveTotalUsd,
        });
      } else if (isUsdPurchase) {
        if (dto.totalCostUsd !== undefined) updateData.totalCostUsd = dto.totalCostUsd;
        if (dto.exchangeRate !== undefined) updateData.exchangeRate = dto.exchangeRate;
      }
    }

    return this.purchaseRepository.update(id, updateData);
  }
}
