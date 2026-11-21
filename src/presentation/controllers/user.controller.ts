import { AccountingOwnPassword } from '../../common/decorators/accounting-access.decorator';
import { SellerAccess } from '../../common/decorators/seller-access.decorator';
import { Controller, Get, Post, Put, Patch, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GetUsersUseCase } from '../../application/use-cases/user/get-users.use-case';
import { GetUserByIdUseCase } from '../../application/use-cases/user/get-user-by-id.use-case';
import { CreateUserUseCase } from '../../application/use-cases/user/create-user.use-case';
import { UpdateUserUseCase } from '../../application/use-cases/user/update-user.use-case';
import { ChangePasswordUseCase } from '../../application/use-cases/user/change-password.use-case';
import { ToggleUserStatusUseCase } from '../../application/use-cases/user/toggle-user-status.use-case';
import { CreateUserDto } from '../../application/dtos/user/create-user.dto';
import { UpdateUserDto } from '../../application/dtos/user/update-user.dto';
import { ChangePasswordDto } from '../../application/dtos/user/change-password.dto';
import { FilterUserDto } from '../../application/dtos/user/filter-user.dto';

@ApiTags('Users')
@ApiBearerAuth('JWT')
@Controller('users')
export class UserController {
  constructor(
    private readonly getUsers: GetUsersUseCase,
    private readonly getUserById: GetUserByIdUseCase,
    private readonly createUser: CreateUserUseCase,
    private readonly updateUser: UpdateUserUseCase,
    private readonly changePassword: ChangePasswordUseCase,
    private readonly toggleUserStatus: ToggleUserStatusUseCase,
  ) {}

  @Roles('ADMIN')
  @Get()
  @ApiOperation({ summary: 'Listar usuarios', description: 'Obtiene lista paginada de usuarios con filtros' })
  async findAll(@Query() filter: FilterUserDto) {
    return this.getUsers.execute(filter);
  }

  @Roles('ADMIN')
  @Get(':id')
  @ApiOperation({ summary: 'Obtener usuario por ID' })
  @ApiParam({ name: 'id', description: 'ID del usuario' })
  async findOne(@Param('id') id: string) {
    return this.getUserById.execute(id);
  }

  @Roles('ADMIN')
  @Post()
  @ApiOperation({ summary: 'Crear usuario', description: 'Crea un nuevo usuario en el sistema' })
  async create(@Body() dto: CreateUserDto) {
    return this.createUser.execute(dto);
  }

  @Roles('ADMIN')
  @Put(':id')
  @ApiOperation({ summary: 'Actualizar usuario', description: 'Modifica nombre y/o rol de un usuario' })
  @ApiParam({ name: 'id', description: 'ID del usuario' })
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.updateUser.execute(id, dto);
  }

  @AccountingOwnPassword()
  @Patch(':id/password')
  @ApiOperation({ summary: 'Cambiar contrasena', description: 'Cambia la contrasena de un usuario. Self requiere currentPassword, admin puede resetear sin ella' })
  @ApiParam({ name: 'id', description: 'ID del usuario' })
  @SellerAccess()
  async updatePassword(
    @Param('id') id: string,
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.changePassword.execute(id, dto, user);
  }

  @Roles('ADMIN')
  @Patch(':id/toggle-status')
  @ApiOperation({ summary: 'Activar/desactivar usuario', description: 'Cambia el estado activo/inactivo de un usuario' })
  @ApiParam({ name: 'id', description: 'ID del usuario' })
  async toggleStatus(
    @Param('id') id: string,
    @CurrentUser('id') requestingUserId: string,
  ) {
    return this.toggleUserStatus.execute(id, requestingUserId);
  }
}
