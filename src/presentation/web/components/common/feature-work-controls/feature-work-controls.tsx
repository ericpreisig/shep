'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { GitFork, MessageSquareMore } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ParentFeatureCombobox } from '@/components/common/feature-create-drawer/feature-create-drawer';
import {
  getFeatureWorkControls,
  correctFeature,
  type FeatureWorkControlsData,
} from '@/app/actions/feature-work-controls';
import { reparentFeature } from '@/app/actions/reparent-feature';

export function FeatureWorkControls({
  featureId,
  initialData,
}: {
  featureId: string;
  initialData?: FeatureWorkControlsData;
}) {
  const { t } = useTranslation('web');
  const [data, setData] = useState(initialData);
  const [parents, setParents] = useState(initialData?.parents ?? []);
  const [correction, setCorrection] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, startTransition] = useTransition();
  useEffect(() => {
    if (initialData) return;
    let disposed = false;
    getFeatureWorkControls(featureId)
      .then((result) => {
        if (!disposed) {
          setData(result);
          setParents(result.parents);
        }
      })
      .catch((reason) => {
        if (!disposed) setError(String(reason));
      });
    return () => {
      disposed = true;
    };
  }, [featureId, initialData]);
  if (!data)
    return error ? (
      <p role="alert" className="px-3 text-sm text-red-500">
        {error}
      </p>
    ) : null;

  function submit(action: 'parents' | 'correction') {
    setError('');
    setNotice('');
    startTransition(async () => {
      const result =
        action === 'parents'
          ? await reparentFeature(featureId, parents)
          : await correctFeature(featureId, correction);
      if (!result.success) {
        setError(result.error ?? t('featureWork.failed'));
        return;
      }
      if (action === 'correction') setCorrection('');
      setData((current) =>
        current
          ? {
              ...current,
              parents: action === 'parents' ? parents : current.parents,
              corrections:
                action === 'correction'
                  ? [...current.corrections, correction.trim()]
                  : current.corrections,
            }
          : current
      );
      setNotice(
        t(action === 'parents' ? 'featureWork.parentsSaved' : 'featureWork.correctionSent')
      );
      window.dispatchEvent(new CustomEvent('shep:feature-approved', { detail: { featureId } }));
    });
  }

  return (
    <div className="space-y-4 px-3 pt-4" data-testid="feature-work-controls">
      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <GitFork className="size-4" />
          {t('featureWork.parents')}
        </h3>
        <p className="text-muted-foreground text-xs">
          {t(data.editable ? 'featureWork.parentsHint' : 'featureWork.parentsLocked')}
        </p>
        <ParentFeatureCombobox
          features={data.choices}
          value={parents}
          onChange={setParents}
          disabled={!data.editable || busy}
        />
        {data.editable ? (
          <Button
            variant="outline"
            size="sm"
            disabled={busy || JSON.stringify(parents) === JSON.stringify(data.parents)}
            onClick={() => submit('parents')}
          >
            {t('featureWork.saveParents')}
          </Button>
        ) : null}
      </section>
      {data.canCorrect ? (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <MessageSquareMore className="size-4" />
            {t('featureWork.correct')}
          </h3>
          <p className="text-muted-foreground text-xs">{t('featureWork.correctHint')}</p>
          <Textarea
            value={correction}
            onChange={(event) => setCorrection(event.target.value)}
            placeholder={t('featureWork.placeholder')}
            aria-label={t('featureWork.correct')}
            disabled={busy}
          />
          <Button
            size="sm"
            disabled={busy || !correction.trim()}
            onClick={() => submit('correction')}
          >
            {t(busy ? 'featureWork.applying' : 'featureWork.sendCorrection')}
          </Button>
        </section>
      ) : null}
      {data.corrections.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm">
            {t('featureWork.history')} ({data.corrections.length})
          </summary>
          <ol className="text-muted-foreground mt-2 list-inside list-decimal space-y-1 text-xs">
            {data.corrections.map((text, index) => (
              // Corrections are an append-only history; existing entries never move.
              // eslint-disable-next-line react/no-array-index-key
              <li key={index}>{text}</li>
            ))}
          </ol>
        </details>
      )}
      {error ? (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-emerald-600">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
