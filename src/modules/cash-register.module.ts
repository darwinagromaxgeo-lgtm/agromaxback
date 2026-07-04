import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CashRegisterDocument, CashRegisterSchema } from '../infrastructure/database/mongodb/schemas/cash-register.schema';
import { MongoCashRegisterRepository } from '../infrastructure/database/mongodb/repositories/mongo-cash-register.repository';
import { CASH_REGISTER_REPOSITORY } from '../domain/repositories/cash-register.repository';
import { OpenCashRegisterUseCase } from '../application/use-cases/cash-register/open-cash-register.use-case';
import { AddEntryUseCase } from '../application/use-cases/cash-register/add-entry.use-case';
import { EditEntryUseCase } from '../application/use-cases/cash-register/edit-entry.use-case';
import { DeleteEntryUseCase } from '../application/use-cases/cash-register/delete-entry.use-case';
import { CloseCashRegisterUseCase } from '../application/use-cases/cash-register/close-cash-register.use-case';
import { AdjustOpeningBalanceUseCase } from '../application/use-cases/cash-register/adjust-opening-balance.use-case';
import { GetCashRegistersUseCase } from '../application/use-cases/cash-register/get-cash-registers.use-case';
import { GetCashRegisterByDateUseCase } from '../application/use-cases/cash-register/get-cash-register-by-date.use-case';
import { CashRegisterController } from '../presentation/controllers/cash-register.controller';
import { SaleModule } from './sale.module';
import { StockModule } from './stock.module';
import { ProductModule } from './product.module';
import { CreditAccountModule } from './credit-account.module';
import { StockMovementModule } from './stock-movement.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CashRegisterDocument.name, schema: CashRegisterSchema }]),
    forwardRef(() => SaleModule), StockModule, ProductModule, CreditAccountModule, StockMovementModule,
  ],
  controllers: [CashRegisterController],
  providers: [
    { provide: CASH_REGISTER_REPOSITORY, useClass: MongoCashRegisterRepository },
    OpenCashRegisterUseCase, AddEntryUseCase, EditEntryUseCase, DeleteEntryUseCase,
    CloseCashRegisterUseCase, AdjustOpeningBalanceUseCase, GetCashRegistersUseCase, GetCashRegisterByDateUseCase,
  ],
  exports: [CASH_REGISTER_REPOSITORY, OpenCashRegisterUseCase, AddEntryUseCase],
})
export class CashRegisterModule {}
