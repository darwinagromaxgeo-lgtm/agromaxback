import { Controller, Get, Post, Put, Body, Param, Query, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { CreateClientUseCase } from '../../application/use-cases/client/create-client.use-case';
import { GetClientsUseCase } from '../../application/use-cases/client/get-clients.use-case';
import { CreateClientDto } from '../../application/dtos/client/create-client.dto';
import { UpdateClientDto } from '../../application/dtos/client/update-client.dto';
import { PaginationDto } from '../../application/dtos/common/pagination.dto';
import { IClientRepository, CLIENT_REPOSITORY } from '../../domain/repositories/client.repository';

@ApiTags('Clients')
@ApiBearerAuth('JWT')
@Controller('clients')
export class ClientController {
  constructor(
    private readonly createClient: CreateClientUseCase,
    private readonly getClients: GetClientsUseCase,
    @Inject(CLIENT_REPOSITORY) private readonly clientRepository: IClientRepository,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear cliente', description: 'Registra un nuevo cliente en el sistema' })
  async create(@Body() dto: CreateClientDto) { return this.createClient.execute(dto); }

  @Get()
  @ApiOperation({ summary: 'Listar clientes', description: 'Obtiene lista paginada de clientes' })
  async findAll(@Query() filter: PaginationDto) { return this.getClients.execute(filter); }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar cliente', description: 'Modifica los datos de un cliente existente' })
  @ApiParam({ name: 'id', description: 'ID del cliente' })
  async update(@Param('id') id: string, @Body() dto: UpdateClientDto) { return this.clientRepository.update(id, dto); }
}
