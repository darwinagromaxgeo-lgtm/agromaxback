import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClientDocument, ClientSchema } from '../infrastructure/database/mongodb/schemas/client.schema';
import { MongoClientRepository } from '../infrastructure/database/mongodb/repositories/mongo-client.repository';
import { CLIENT_REPOSITORY } from '../domain/repositories/client.repository';
import { CreateClientUseCase } from '../application/use-cases/client/create-client.use-case';
import { GetClientsUseCase } from '../application/use-cases/client/get-clients.use-case';
import { ClientController } from '../presentation/controllers/client.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: ClientDocument.name, schema: ClientSchema }])],
  controllers: [ClientController],
  providers: [{ provide: CLIENT_REPOSITORY, useClass: MongoClientRepository }, CreateClientUseCase, GetClientsUseCase],
  exports: [CLIENT_REPOSITORY],
})
export class ClientModule {}
