import { Injectable, Inject } from '@nestjs/common';
import { IAccountPayableRepository, ACCOUNT_PAYABLE_REPOSITORY } from '../../../domain/repositories/account-payable.repository';

@Injectable()
export class GetAccountPayableByIdUseCase {
  constructor(
    @Inject(ACCOUNT_PAYABLE_REPOSITORY) private readonly apRepository: IAccountPayableRepository,
  ) {}

  async execute(id: string) {
    return this.apRepository.findById(id);
  }
}
