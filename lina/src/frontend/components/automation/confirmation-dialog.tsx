import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ConfirmationDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  positionCount: number;
}

export function ConfirmationDialog({
  isOpen,
  onConfirm,
  onCancel,
  positionCount,
}: ConfirmationDialogProps) {
  const { t } = useTranslation('modals');

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center confirmation-dialog-overlay"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmation-title"
    >
      <div
        className="confirmation-dialog-content max-w-md w-full mx-4 rounded-lg p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-warning/20 border border-warning/40">
            <AlertTriangle className="size-5 text-warning" />
          </div>
          <h3 id="confirmation-title" className="text-lg font-display text-foreground uppercase">
            {t('confirmation.stopAutomation')}
          </h3>
        </div>

        {/* Content */}
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {positionCount > 0 ? (
              <>
                {t('confirmation.openPositions', { count: positionCount })}
                {' '}
                <span className="text-foreground">{t('confirmation.positionsWarning')}</span>
              </>
            ) : (
              <>
                {t('confirmation.noPositions')}
              </>
            )}
          </p>
          {positionCount > 0 && (
            <p className="text-xs text-muted-foreground/70 italic border-l-2 border-warning/30 pl-3 mt-2">
              {t('confirmation.manualMonitoring')}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="hover:bg-accent"
          >
            {t('common:buttons.cancel')}
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            className={cn(
              "bg-warning/20 text-warning border border-warning/40",
              "hover:bg-warning/30 hover:border-warning/60",
              "transition-all"
            )}
          >
            {t('confirmation.stopButton')}
          </Button>
        </div>
      </div>
    </div>
  );
}
