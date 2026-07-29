import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { ICreditAccountRepository, CREDIT_ACCOUNT_REPOSITORY } from '../../../domain/repositories/credit-account.repository';
import { ISaleRepository, SALE_REPOSITORY } from '../../../domain/repositories/sale.repository';

@Injectable()
export class AddSaleToCreditUseCase {
  constructor(
    @Inject(CREDIT_ACCOUNT_REPOSITORY) private readonly creditRepository: ICreditAccountRepository,
    @Inject(SALE_REPOSITORY) private readonly saleRepository: ISaleRepository,
  ) {}

  async execute(creditId: string, saleId: string, amount: number) {
    const [credit, sale, existingCredit] = await Promise.all([
      this.creditRepository.findById(creditId),
      this.saleRepository.findById(saleId),
      this.creditRepository.findBySaleId(saleId),
    ]);

    if (!credit) throw new BadRequestException('Cuenta de crédito no encontrada');
    if (credit.status === 'PAID') throw new BadRequestException('La cuenta de crédito ya está completamente pagada');
    if (!sale) throw new BadRequestException('Venta no encontrada en la sucursal activa');
    if (!sale.isCredit) throw new BadRequestException('La venta seleccionada no es una venta a crédito');
    if (!sale.clientId || sale.clientId !== credit.clientId) {
      throw new BadRequestException('La venta y la cuenta de crédito deben pertenecer al mismo cliente');
    }
    if (existingCredit) throw new BadRequestException('La venta ya pertenece a una cuenta de crédito');
    if (Math.abs(sale.total - amount) > 0.01) {
      throw new BadRequestException('El monto debe coincidir con el total de la venta');
    }

    return this.creditRepository.addSale(creditId, saleId, amount);
  }
}
