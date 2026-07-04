import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LoanDocument, LoanSchema } from '../infrastructure/database/mongodb/schemas/loan.schema';
import { MongoLoanRepository } from '../infrastructure/database/mongodb/repositories/mongo-loan.repository';
import { LOAN_REPOSITORY } from '../domain/repositories/loan.repository';
import { CreateLoanUseCase } from '../application/use-cases/loan/create-loan.use-case';
import { GetLoansUseCase } from '../application/use-cases/loan/get-loans.use-case';
import { ReturnLoanItemsUseCase } from '../application/use-cases/loan/return-loan-items.use-case';
import { LoanController } from '../presentation/controllers/loan.controller';
import { StockModule } from './stock.module';
import { ProductModule } from './product.module';
import { StockMovementModule } from './stock-movement.module';
import { ProductLotModule } from './product-lot.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: LoanDocument.name, schema: LoanSchema }]),
    StockModule,
    ProductModule,
    StockMovementModule,
    ProductLotModule,
  ],
  controllers: [LoanController],
  providers: [
    { provide: LOAN_REPOSITORY, useClass: MongoLoanRepository },
    CreateLoanUseCase,
    GetLoansUseCase,
    ReturnLoanItemsUseCase,
  ],
  exports: [LOAN_REPOSITORY],
})
export class LoanModule {}
