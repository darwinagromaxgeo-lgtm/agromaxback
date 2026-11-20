import { SellerAccess } from '../../common/decorators/seller-access.decorator';
import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { CreateUnitUseCase } from '../../application/use-cases/unit/create-unit.use-case';
import { GetUnitsUseCase } from '../../application/use-cases/unit/get-units.use-case';
import { UpdateUnitUseCase } from '../../application/use-cases/unit/update-unit.use-case';
import { DeleteUnitUseCase } from '../../application/use-cases/unit/delete-unit.use-case';
import { CreateUnitDto } from '../../application/dtos/unit/create-unit.dto';
import { UpdateUnitDto } from '../../application/dtos/unit/update-unit.dto';

@ApiTags('Units')
@ApiBearerAuth('JWT')
@Controller('units')
export class UnitController {
  constructor(
    private readonly createUnit: CreateUnitUseCase,
    private readonly getUnits: GetUnitsUseCase,
    private readonly updateUnit: UpdateUnitUseCase,
    private readonly deleteUnit: DeleteUnitUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear unidad de medida' })
  async create(@Body() dto: CreateUnitDto) {
    return this.createUnit.execute(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar unidades de medida' })
  @SellerAccess()
  async findAll() {
    return this.getUnits.execute();
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar unidad de medida' })
  @ApiParam({ name: 'id', description: 'ID de la unidad' })
  async update(@Param('id') id: string, @Body() dto: UpdateUnitDto) {
    return this.updateUnit.execute(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Desactivar unidad de medida' })
  @ApiParam({ name: 'id', description: 'ID de la unidad' })
  async remove(@Param('id') id: string) {
    return this.deleteUnit.execute(id);
  }
}
