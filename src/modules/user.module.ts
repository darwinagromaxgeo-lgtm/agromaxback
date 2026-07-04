import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserDocument, UserSchema } from '../infrastructure/database/mongodb/schemas/user.schema';
import { MongoUserRepository } from '../infrastructure/database/mongodb/repositories/mongo-user.repository';
import { USER_REPOSITORY } from '../domain/repositories/user.repository';
import { GetUsersUseCase } from '../application/use-cases/user/get-users.use-case';
import { GetUserByIdUseCase } from '../application/use-cases/user/get-user-by-id.use-case';
import { CreateUserUseCase } from '../application/use-cases/user/create-user.use-case';
import { UpdateUserUseCase } from '../application/use-cases/user/update-user.use-case';
import { ChangePasswordUseCase } from '../application/use-cases/user/change-password.use-case';
import { ToggleUserStatusUseCase } from '../application/use-cases/user/toggle-user-status.use-case';
import { UserController } from '../presentation/controllers/user.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: UserDocument.name, schema: UserSchema }]),
  ],
  controllers: [UserController],
  providers: [
    { provide: USER_REPOSITORY, useClass: MongoUserRepository },
    GetUsersUseCase,
    GetUserByIdUseCase,
    CreateUserUseCase,
    UpdateUserUseCase,
    ChangePasswordUseCase,
    ToggleUserStatusUseCase,
  ],
})
export class UserModule {}
