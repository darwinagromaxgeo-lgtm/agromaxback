import { Controller, Post, Body, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LoginUseCase } from '../../application/use-cases/auth/login.use-case';
import { RegisterUseCase } from '../../application/use-cases/auth/register.use-case';
import { ValidateTokenUseCase } from '../../application/use-cases/auth/validate-token.use-case';
import { LoginDto } from '../../application/dtos/auth/login.dto';
import { RegisterDto } from '../../application/dtos/auth/register.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly registerUseCase: RegisterUseCase,
    private readonly validateTokenUseCase: ValidateTokenUseCase,
  ) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Iniciar sesion', description: 'Autentica un usuario y devuelve un token JWT' })
  async login(@Body() dto: LoginDto) { return this.loginUseCase.execute(dto.username, dto.password); }

  @Roles('ADMIN')
  @ApiBearerAuth('JWT')
  @Post('register')
  @ApiOperation({ summary: 'Registrar usuario', description: 'Crea un nuevo usuario en el sistema (solo ADMIN)' })
  async register(@Body() dto: RegisterDto) { return this.registerUseCase.execute(dto.username, dto.password, dto.fullName, dto.role, dto.email); }

  @ApiBearerAuth('JWT')
  @Get('me')
  @ApiOperation({ summary: 'Obtener usuario actual', description: 'Devuelve los datos del usuario autenticado' })
  async me(@CurrentUser('id') userId: string) { return this.validateTokenUseCase.execute(userId); }
}
