import { SellerAccess } from '../../common/decorators/seller-access.decorator';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { LookupService } from '../../application/services/lookup.service';

@ApiTags('Lookup')
@ApiBearerAuth('JWT')
@Controller('lookup')
@SellerAccess()
export class LookupController {
  constructor(private readonly lookupService: LookupService) {}

  @Get('dni/:numero')
  @ApiOperation({ summary: 'Buscar por DNI', description: 'Consulta datos de persona por DNI via Decolecta/RENIEC' })
  @ApiParam({ name: 'numero', description: 'Número de DNI (8 dígitos)' })
  async searchByDni(@Param('numero') numero: string) {
    return this.lookupService.searchByDni(numero);
  }

  @Get('ruc/:numero')
  @ApiOperation({ summary: 'Buscar por RUC', description: 'Consulta datos de empresa por RUC via Decolecta/SUNAT' })
  @ApiParam({ name: 'numero', description: 'Número de RUC (11 dígitos)' })
  async searchByRuc(@Param('numero') numero: string) {
    return this.lookupService.searchByRuc(numero);
  }

  @Get('tipo-cambio')
  @ApiOperation({ summary: 'Tipo de cambio SUNAT', description: 'Consulta tipo de cambio del día via Decolecta/SUNAT' })
  @ApiQuery({ name: 'date', required: false, description: 'Fecha en formato YYYY-MM-DD (default: hoy)' })
  async getTipoCambio(@Query('date') date?: string) {
    return this.lookupService.getTipoCambio(date);
  }
}
