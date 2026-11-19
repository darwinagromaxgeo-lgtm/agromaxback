import { Schema } from 'mongoose';
import { BillingDocument, BillingDocumentSchema } from './billing-document.schema';
import { applyBranchScope } from '../branch-scope.plugin';

export class BillingCreditNote extends BillingDocument {}
// Reuse the immutable fiscal snapshot fields, in a separate collection. Invoice uniqueness stays intact.
export const BillingCreditNoteSchema = new Schema<any>({
  ...BillingDocumentSchema.obj,
  documentType: { type:String, enum:['NOTA_CREDITO'], required:true },
  activeSlot: { type:Boolean, default:false },
  originalDocument: { type:Schema.Types.ObjectId, ref:BillingDocument.name, required:true },
  originalDocumentType: { type:String, enum:['FACTURA','BOLETA'], required:true },
  originalSeries: { type:String, required:true }, originalNumber:{ type:Number, required:true },
  originalIssuedAt: { type:Date, required:true },
  reasonCode:{ type:String, enum:['06','07'], required:true }, reasonDescription:{ type:String, required:true },
  requestId:{ type:String, required:true }, requestHash:{ type:String, required:true },
  holdsReservation:{ type:Boolean, default:true },
}, { timestamps:true, collection:'billing_credit_notes' });
applyBranchScope(BillingCreditNoteSchema);
BillingCreditNoteSchema.index({ branch:1, createdAt:-1 });
BillingCreditNoteSchema.index({ branch:1, originalDocument:1 });
BillingCreditNoteSchema.index({ branch:1, requestId:1 }, { unique:true });
BillingCreditNoteSchema.index({ originalDocument:1 }, { unique:true, partialFilterExpression:{ holdsReservation:true }, name:'one_unresolved_credit_note_per_original' });
