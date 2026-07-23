import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { BranchScoped } from '../../common/decorators/branch-scoped.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { CreateLoanUseCase } from '../../application/use-cases/loan/create-loan.use-case';
import { GetLoansUseCase } from '../../application/use-cases/loan/get-loans.use-case';
import { ReturnLoanItemsUseCase } from '../../application/use-cases/loan/return-loan-items.use-case';
import { CreateLoanDto } from '../../application/dtos/loan/create-loan.dto';
import { ReturnLoanDto } from '../../application/dtos/loan/return-loan.dto';
import { FilterLoanDto } from '../../application/dtos/loan/filter-loan.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Loans')
@ApiBearerAuth('JWT')
@Controller('loans')
@BranchScoped()
export class LoanController {
  constructor(
    private readonly createLoan: CreateLoanUseCase,
    private readonly getLoans: GetLoansUseCase,
    private readonly returnLoanItems: ReturnLoanItemsUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Registrar préstamo', description: 'Crea un préstamo de productos a otra tienda. Descuenta stock pero no genera movimiento de caja.' })
  async create(@Body() dto: CreateLoanDto, @CurrentUser('id') userId: string) {
    return this.createLoan.execute(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'Listar préstamos', description: 'Obtiene lista paginada de préstamos con filtros opcionales' })
  async findAll(@Query() filter: FilterLoanDto) {
    return this.getLoans.execute(filter);
  }

  @Post(':id/returns')
  @ApiOperation({ summary: 'Registrar devolución', description: 'Registra la devolución parcial o total de un préstamo. Incrementa stock.' })
  @ApiParam({ name: 'id', description: 'ID del préstamo' })
  async returnItems(@Param('id') id: string, @Body() dto: ReturnLoanDto, @CurrentUser('id') userId: string) {
    return this.returnLoanItems.execute(id, dto, userId);
  }
}
