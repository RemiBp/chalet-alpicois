import { previewMailTemplate, type MailTemplatePreview } from '../data';

export type StepPreviewState = MailTemplatePreview & {
  editingSubject: string;
  editingBody: string;
  attachToThread: boolean;
  replyToEmailId: string | null;
  draftSuccess: string | null;
  showThread: boolean;
};

export async function loadStepPreview(
  contactId: string,
  templateKey: string,
  lang: 'fr' | 'en',
  opts?: { attachToThread?: boolean; replyToEmailId?: string | null },
): Promise<StepPreviewState> {
  const preview = await previewMailTemplate(contactId, templateKey, lang, opts);
  return {
    ...preview,
    editingSubject: preview.subject,
    editingBody: preview.body,
    attachToThread: preview.attachToThread,
    replyToEmailId: preview.replyToEmailId,
    draftSuccess: null,
    showThread: false,
  };
}
