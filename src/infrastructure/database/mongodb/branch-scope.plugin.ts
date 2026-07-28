import { Schema, Types } from 'mongoose';
import { getCurrentBranchId } from '../../../common/branch/branch-context';

export function applyBranchScope(schema: Schema): void {
  schema.pre('validate', function (next) {
    const branchId = getCurrentBranchId();
    if (branchId && !(this as any).branch) (this as any).branch = new Types.ObjectId(branchId);
    next();
  });

  schema.pre(/^find/, function (next) {
    if ((this as any).getOptions?.().skipBranchScope) return next();
    const branchId = getCurrentBranchId();
    if (branchId) (this as any).where({ branch: new Types.ObjectId(branchId) });
    next();
  });

  schema.pre('countDocuments', function (next) {
    if ((this as any).getOptions?.().skipBranchScope) return next();
    const branchId = getCurrentBranchId();
    if (branchId) (this as any).where({ branch: new Types.ObjectId(branchId) });
    next();
  });

  schema.pre('aggregate', function (next) {
    if ((this as any).options?.skipBranchScope) return next();
    const branchId = getCurrentBranchId();
    if (branchId) this.pipeline().unshift({ $match: { branch: new Types.ObjectId(branchId) } });
    next();
  });
}
