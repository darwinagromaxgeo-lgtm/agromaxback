import { Schema } from 'mongoose';

export const BRANCH_TRANSFER_MODEL = 'BranchTransfer';
// Two explicit branch fields replace the single-branch scope used by ordinary inventory records.
export const BranchTransferSchema = new Schema({
  requestId: { type: String, required: true }, requestHash: { type: String, required: true, select: false },
  fromBranch: { type: Schema.Types.ObjectId, required: true }, fromBranchName: { type: String, required: true },
  toBranch: { type: Schema.Types.ObjectId, required: true }, toBranchName: { type: String, required: true },
  company: { type: Schema.Types.ObjectId, required: true }, companyName: { type: String, required: true },
  status: { type: String, enum: ['COMPLETED'], required: true },
  items: { type: [Schema.Types.Mixed], required: true }, notes: String,
  transferredBy: { type: Schema.Types.ObjectId, required: true }, transferredByName: String,
}, { collection: 'branch_stock_transfers', timestamps: true });
BranchTransferSchema.index({ requestId: 1 }, { unique: true });
BranchTransferSchema.index({ fromBranch: 1, createdAt: -1 });
BranchTransferSchema.index({ toBranch: 1, createdAt: -1 });
