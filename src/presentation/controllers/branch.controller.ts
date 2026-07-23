import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateBranchDto } from '../../application/dtos/branch/create-branch.dto';
import { UpdateBranchDto } from '../../application/dtos/branch/update-branch.dto';
import { ManageBranchesUseCase } from '../../application/use-cases/branch/manage-branches.use-case';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Branches')
@ApiBearerAuth('JWT')
@Controller('branches')
export class BranchController {
  constructor(private readonly manageBranches: ManageBranchesUseCase) {}

  @Get('accessible')
  @ApiOperation({ summary: 'Listar sucursales disponibles para el usuario actual' })
  accessible(@CurrentUser('id') userId: string, @CurrentUser('role') role: string) {
    return this.manageBranches.accessible(userId, role);
  }

  @Roles('ADMIN')
  @Get()
  list() {
    return this.manageBranches.list();
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateBranchDto) {
    return this.manageBranches.create(dto);
  }

  @Roles('ADMIN')
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBranchDto) {
    return this.manageBranches.update(id, dto);
  }

  @Roles('ADMIN')
  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body('isActive') isActive: boolean) {
    return this.manageBranches.update(id, { isActive });
  }
}
