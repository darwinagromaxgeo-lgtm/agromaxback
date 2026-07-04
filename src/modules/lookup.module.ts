import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { LookupService } from '../application/services/lookup.service';
import { LookupController } from '../presentation/controllers/lookup.controller';

@Module({
  imports: [HttpModule.register({ baseURL: 'https://api.decolecta.com/v1', timeout: 10000 })],
  controllers: [LookupController],
  providers: [LookupService],
  exports: [LookupService],
})
export class LookupModule {}
