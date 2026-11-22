import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { IUserRepository, USER_REPOSITORY } from '../../../domain/repositories/user.repository';

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
    private readonly jwtService: JwtService,
  ) {}

  async execute(username: string, password: string) {
    const user = await this.userRepository.findByUsername(username);
    if (!user || !user.isActive) throw new UnauthorizedException('Credenciales inválidas');
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) throw new UnauthorizedException('Credenciales inválidas');

    if (user.role === 'VENDEDOR') {
      const limaTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }));
      const totalMinutes = limaTime.getHours() * 60 + limaTime.getMinutes();

      if (totalMinutes < 360 || totalMinutes > 1260) {
        throw new UnauthorizedException('El ingreso de vendedores está habilitado todos los días, de 6:00 a. m. a 9:00 p. m. (hora de Perú)');
      }
    }

    const payload = { sub: user.id, username: user.username, role: user.role };
    return {
      accessToken: this.jwtService.sign(payload),
      user: { id: user.id, username: user.username, email: user.email, fullName: user.fullName, role: user.role, branchAssignments: user.branchAssignments || [] },
    };
  }
}
