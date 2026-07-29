import { Controller, Get, Post, Patch, Body, Param, Query, Req } from '@nestjs/common';
import { BranchScoped } from '../../common/decorators/branch-scoped.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CreateQuoteUseCase } from '../../application/use-cases/quote/create-quote.use-case';
import { GetQuotesUseCase } from '../../application/use-cases/quote/get-quotes.use-case';
import { UpdateQuoteStatusUseCase } from '../../application/use-cases/quote/update-quote-status.use-case';
import { ConvertQuoteToSaleUseCase } from '../../application/use-cases/quote/convert-quote-to-sale.use-case';
import { CreateQuoteDto } from '../../application/dtos/quote/create-quote.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { QuoteStatus } from '../../domain/entities/quote.entity';
import { CurrentBranch } from '../../common/decorators/current-branch.decorator';

@ApiTags('Quotes')
@ApiBearerAuth('JWT')
@Controller('quotes')
@BranchScoped()
export class QuoteController {
  constructor(
    private readonly createQuote: CreateQuoteUseCase,
    private readonly getQuotes: GetQuotesUseCase,
    private readonly updateStatus: UpdateQuoteStatusUseCase,
    private readonly convertToSale: ConvertQuoteToSaleUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear proforma' })
  async create(@Body() dto: CreateQuoteDto, @CurrentUser('id') userId: string, @Req() req: any) {
    return this.createQuote.execute(dto, userId, req.branchId);
  }

  @Get()
  @ApiOperation({ summary: 'Listar proformas' })
  async findAll(
    @Query('status') status?: string,
    @Query('clientId') clientId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.getQuotes.execute({
      status: status as QuoteStatus,
      clientId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener proforma por ID' })
  async findOne(@Param('id') id: string) {
    return this.getQuotes.findById(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Cambiar estado (accept/reject)' })
  async setStatus(@Param('id') id: string, @Body('status') status: QuoteStatus) {
    return this.updateStatus.execute(id, status);
  }

  @Post(':id/convert')
  @ApiOperation({ summary: 'Convertir proforma en venta' })
  async convert(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser('id') userId: string,
    @CurrentBranch('id') branchId: string,
  ) {
    return this.convertToSale.execute(id, body, userId, branchId);
  }
}
