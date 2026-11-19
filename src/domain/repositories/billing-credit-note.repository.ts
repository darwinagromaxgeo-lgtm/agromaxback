import { BillingDocumentEntity, BillingSubmissionResult } from '../entities/billing-document.entity';
import { BillingCreditNoteEntity } from '../entities/billing-credit-note.entity';

export interface IBillingCreditNoteRepository {
  findAll(branchId: string, filter: { originalDocumentId?:string; companyId?:string; status?:string; page:number; limit:number }): Promise<{ data:BillingCreditNoteEntity[]; total:number }>;
  findById(id:string, branchId:string): Promise<BillingCreditNoteEntity | null>;
  forOriginal(id:string, branchId:string): Promise<BillingCreditNoteEntity[]>;
  createDraft(originalId:string, branchId:string, requestId:string, requestHash:string, build:(original:BillingDocumentEntity, previous:BillingCreditNoteEntity[])=>BillingCreditNoteEntity): Promise<BillingCreditNoteEntity>;
  claimDraft(id:string, branchId:string, userId:string): Promise<BillingCreditNoteEntity | null>;
  discard(id:string, branchId:string, reason:string, userId:string): Promise<BillingCreditNoteEntity | null>;
  setSubmission(id:string, branchId:string, data:Partial<BillingCreditNoteEntity>): Promise<void>;
  saveResult(id:string, branchId:string, result:BillingSubmissionResult): Promise<BillingCreditNoteEntity>;
  artifact(id:string, branchId:string, format:'pdf'|'xml'|'cdr'): Promise<{ data:string; filename:string } | null>;
}
export const BILLING_CREDIT_NOTE_REPOSITORY = 'BILLING_CREDIT_NOTE_REPOSITORY';
