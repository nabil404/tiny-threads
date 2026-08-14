import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from './confirm-dialog';

export interface UnsavedChangesDialogProps {
  open: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
}

export function UnsavedChangesDialog({
  open,
  onConfirm,
  onCancel,
  title,
  description,
  confirmText,
  cancelText,
}: UnsavedChangesDialogProps) {
  const { t } = useTranslation();

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onCancel();
      }}
      title={title ?? t('common.unsavedChangesTitle')}
      description={description ?? t('common.unsavedChangesDescription')}
      confirmText={confirmText ?? t('common.leavePage')}
      cancelText={cancelText ?? t('common.stayOnPage')}
      variant="destructive"
      onConfirm={onConfirm}
    />
  );
}
