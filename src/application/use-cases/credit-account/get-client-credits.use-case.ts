import { Injectable, Inject } from '@nestjs/common';
import { ICreditAccountRepository, CREDIT_ACCOUNT_REPOSITORY } from '../../../domain/repositories/credit-account.repository';

@Injectable()
export class GetClientCreditsUseCase {
  constructor(
    @Inject(CREDIT_ACCOUNT_REPOSITORY) private readonly creditRepository: ICreditAccountRepository,
  ) {}

  async execute(clientId: string, page?: number, limit?: number) {
    return this.creditRepository.findByClientId(clientId, page, limit);
  }
}
