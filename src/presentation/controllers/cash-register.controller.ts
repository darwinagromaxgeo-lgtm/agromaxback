import { AccountingRead } from '../../common/decorators/accounting-access.decorator';
import { SellerAccess } from '../../common/decorators/seller-access.decorator';
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Inject, BadRequestException } from '@nestjs/common';
import { BranchScoped } from '../../common/decorators/branch-scoped.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { OpenCashRegisterUseCase } from '../../application/use-cases/cash-register/open-cash-register.use-case';
import { AddEntryUseCase } from '../../application/use-cases/cash-register/add-entry.use-case';
import { EditEntryUseCase } from '../../application/use-cases/cash-register/edit-entry.use-case';
import { DeleteEntryUseCase } from '../../application/use-cases/cash-register/delete-entry.use-case';
import { CloseCashRegisterUseCase } from '../../application/use-cases/cash-register/close-cash-register.use-case';
import { AdjustOpeningBalanceUseCase } from '../../application/use-cases/cash-register/adjust-opening-balance.use-case';
import { GetCashRegistersUseCase } from '../../application/use-cases/cash-register/get-cash-registers.use-case';
import { GetCashRegisterByDateUseCase } from '../../application/use-cases/cash-register/get-cash-register-by-date.use-case';
import { OpenCashRegisterDto } from '../../application/dtos/cash-register/open-cash-register.dto';
import { AddEntryDto } from '../../application/dtos/cash-register/add-entry.dto';
import { EditEntryDto } from '../../application/dtos/cash-register/edit-entry.dto';
import { DeleteEntryDto } from '../../application/dtos/cash-register/delete-entry.dto';
import { CloseRegisterDto } from '../../application/dtos/cash-register/close-register.dto';
import { AdjustOpeningBalanceDto } from '../../application/dtos/cash-register/adjust-opening-balance.dto';
import { FilterCashRegisterDto } from '../../application/dtos/cash-register/filter-cash-register.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ICashRegisterRepository, CASH_REGISTER_REPOSITORY } from '../../domain/repositories/cash-register.repository';
import { getTodayDateString } from '../../shared/utils/date.util';

@ApiTags('Cash Register')
@ApiBearerAuth('JWT')
@AccountingRead()
@Controller('cash-registers')
@BranchScoped()
export class CashRegisterController {
  constructor(
    private readonly openCashRegister: OpenCashRegisterUseCase,
    private readonly addEntry: AddEntryUseCase,
    private readonly editEntry: EditEntryUseCase,
    private readonly deleteEntry: DeleteEntryUseCase,
    private readonly closeCashRegister: CloseCashRegisterUseCase,
    private readonly adjustOpeningBalance: AdjustOpeningBalanceUseCase,
    private readonly getCashRegisters: GetCashRegistersUseCase,
    private readonly getCashRegisterByDate: GetCashRegisterByDateUseCase,
    @Inject(CASH_REGISTER_REPOSITORY) private readonly cashRegisterRepository: ICashRegisterRepository,
  ) {}

  @Post('open')
  @SellerAccess()
  @ApiOperation({ summary: 'Abrir caja del dia', description: 'Abre la caja diaria o retorna la existente si ya esta abierta (idempotente)' })
  async open(@Body() dto: OpenCashRegisterDto, @CurrentUser('id') userId: string) {
    return this.openCashRegister.execute(dto, userId);
  }

  @Get()
  @SellerAccess()
  @ApiOperation({ summary: 'Listar cajas', description: 'Obtiene historial de cajas con filtros por rango de fechas y estado' })
  async findAll(@Query() filter: FilterCashRegisterDto) {
    return this.getCashRegisters.execute(filter);
  }

  @Get('by-date')
  @SellerAccess()
  @ApiOperation({ summary: 'Obtener caja por fecha', description: 'Busca la caja de una fecha especifica (formato YYYY-MM-DD)' })
  @ApiQuery({ name: 'date', description: 'Fecha en formato YYYY-MM-DD' })
  async findByDate(@Query('date') date: string) {
    return this.getCashRegisterByDate.execute(date);
  }

  @Get('today')
  @SellerAccess()
  @ApiOperation({ summary: 'Obtener caja de hoy', description: 'Retorna la caja del dia actual (timezone Peru) o null si no existe' })
  async findToday() {
    const today = getTodayDateString();
    const register = await this.cashRegisterRepository.findByDate(today);
    return register || null;
  }

  @Get(':id')
  @SellerAccess()
  @ApiOperation({ summary: 'Obtener caja por ID', description: 'Retorna el detalle completo de una caja con todas sus entradas' })
  @ApiParam({ name: 'id', description: 'ID de la caja' })
  async findById(@Param('id') id: string) {
    return this.cashRegisterRepository.findById(id);
  }

  @Post(':id/entries')
  @ApiOperation({ summary: 'Agregar entrada a caja', description: 'Agrega una entrada de ingreso o egreso a la caja del dia (debe estar abierta)' })
  @ApiParam({ name: 'id', description: 'ID de la caja' })
  async createEntry(@Param('id') id: string, @Body() dto: AddEntryDto, @CurrentUser('id') userId: string) {
    if (dto.referenceId || dto.referenceType || ['SALE', 'CREDIT_PAYMENT'].includes(dto.category)) {
      throw new BadRequestException('Las ventas y abonos deben registrarse desde Ventas o Créditos para mantener sus saldos vinculados');
    }
    return this.addEntry.execute(id, dto, userId);
  }

  @Patch(':id/entries/:entryId')
  @ApiOperation({ summary: 'Editar entrada de caja', description: 'Corrige movimientos manuales con motivo e historial. En operaciones vinculadas conserva el importe y el comprobante original; permite identificar un método de pago faltante' })
  @ApiParam({ name: 'id', description: 'ID de la caja' })
  @ApiParam({ name: 'entryId', description: 'ID de la entrada' })
  async updateEntry(@Param('id') id: string, @Param('entryId') entryId: string, @Body() dto: EditEntryDto, @CurrentUser('id') userId: string) {
    return this.editEntry.execute(id, entryId, dto, userId);
  }

  @Delete(':id/entries/:entryId')
  @ApiOperation({ summary: 'Eliminar entrada de caja', description: 'Soft delete de una entrada con razon obligatoria. No se elimina fisicamente' })
  @ApiParam({ name: 'id', description: 'ID de la caja' })
  @ApiParam({ name: 'entryId', description: 'ID de la entrada' })
  async removeEntry(@Param('id') id: string, @Param('entryId') entryId: string, @Body() dto: DeleteEntryDto, @CurrentUser('id') userId: string) {
    return this.deleteEntry.execute(id, entryId, dto, userId);
  }

  @Post(':id/close')
  @SellerAccess()
  @ApiOperation({ summary: 'Cerrar caja', description: 'Cierra la caja del dia. Calcula balance final y bloquea nuevas entradas' })
  @ApiParam({ name: 'id', description: 'ID de la caja' })
  async close(@Param('id') id: string, @Body() dto: CloseRegisterDto, @CurrentUser('id') userId: string) {
    return this.closeCashRegister.execute(id, dto, userId);
  }

  @Patch(':id/opening-balance')
  @ApiOperation({ summary: 'Ajustar balance de apertura', description: 'Modifica el monto de apertura de una caja abierta. Util cuando la caja se abrio automaticamente con 0 pero existia caja chica fisica. Guarda historial con razon obligatoria' })
  @ApiParam({ name: 'id', description: 'ID de la caja' })
  async adjustOpening(@Param('id') id: string, @Body() dto: AdjustOpeningBalanceDto, @CurrentUser('id') userId: string) {
    return this.adjustOpeningBalance.execute(id, dto, userId);
  }
}
