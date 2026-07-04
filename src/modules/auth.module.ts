import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UserDocument, UserSchema } from '../infrastructure/database/mongodb/schemas/user.schema';
import { MongoUserRepository } from '../infrastructure/database/mongodb/repositories/mongo-user.repository';
import { USER_REPOSITORY } from '../domain/repositories/user.repository';
import { LoginUseCase } from '../application/use-cases/auth/login.use-case';
import { RegisterUseCase } from '../application/use-cases/auth/register.use-case';
import { ValidateTokenUseCase } from '../application/use-cases/auth/validate-token.use-case';
import { AuthController } from '../presentation/controllers/auth.controller';
import { JwtStrategy } from '../infrastructure/config/jwt.strategy';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: UserDocument.name, schema: UserSchema }]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('app.jwtSecret'),
        signOptions: { expiresIn: configService.get<string>('app.jwtExpiresIn') },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    { provide: USER_REPOSITORY, useClass: MongoUserRepository },
    LoginUseCase, RegisterUseCase, ValidateTokenUseCase, JwtStrategy,
  ],
  exports: [JwtStrategy, PassportModule],
})
export class AuthModule {}
