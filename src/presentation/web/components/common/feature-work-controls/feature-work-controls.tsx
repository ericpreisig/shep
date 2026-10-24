'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { GitFork, MessageSquareMore } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ParentFeatureCombobox } from '@/components/common/feature-create-drawer/feature-create-drawer';
import {
  getFeatureWorkControls,
  correctFeature,
  prepareAutoTask,
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
  const parentsDirty = useRef(false);
  useEffect(() => {
    if (initialData) return;
    let disposed = false;
    parentsDirty.current = false;
    const refresh = () =>
      getFeatureWorkControls(featureId)
        .then((result) => {
          if (!disposed) {
            setData(result);
            if (!parentsDirty.current) setParents(result.parents);
          }
        })
        .catch((reason) => {
          if (!disposed) setError(String(reason));
        });
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [featureId, initialData]);
  if (!data)
    return error ? (
      <p role="alert" className="px-3 text-sm text-red-500">
        {error}
      </p>
    ) : null;

  function submit(action: 'parents' | 'correction' | 'autotask') {
    setError('');
    setNotice('');
    startTransition(async () => {
      const result =
        action === 'autotask'
          ? await prepareAutoTask(featureId)
          : action === 'parents'
            ? await reparentFeature(featureId, parents)
            : await correctFeature(featureId, correction);
      if (!result.success) {
        setError(result.error ?? t('featureWork.failed'));
        return;
      }
      if (action === 'correction') setCorrection('');
      if (action === 'parents') parentsDirty.current = false;
      if (action === 'autotask') {
        setData(await getFeatureWorkControls(featureId));
        return;
      }
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
      {data.autoTask?.enabled ? (
        <section className="space-y-2" aria-label="AutoTask">
          <h3 className="text-sm font-semibold">AutoTask</h3>
          <p className="text-muted-foreground text-xs">
            {t(
              data.autoTask.plan?.ready
                ? 'featureWork.autoTaskReady'
                : 'featureWork.autoTaskPlanning'
            )}
          </p>
          {data.autoTask.error ? (
            <p role="alert" className="text-destructive text-xs">
              {data.autoTask.error}
            </p>
          ) : null}
          {data.editable && !data.autoTask.plan?.ready ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => submit('autotask')}>
              {t('featureWork.autoTaskRetry')}
            </Button>
          ) : null}
          {data.autoTaskChildren?.length ? (
            <ul aria-label={t('featureWork.autoTaskChildren')} className="space-y-1 text-xs">
              {data.autoTaskChildren.map((child) => (
                <li key={child.id} className="flex items-center justify-between gap-2">
                  <Link className="text-primary hover:underline" href={`/feature/${child.id}`}>
                    {child.name}
                  </Link>
                  <span className="text-muted-foreground">{child.lifecycle}</span>
                </li>
              ))}
            </ul>
          ) : data.autoTask.plan?.ready ? (
            <p className="text-muted-foreground text-xs">{t('featureWork.autoTaskNone')}</p>
          ) : null}
        </section>
      ) : data.autoTask?.sourceFeatureId ? (
        <Link
          className="text-primary text-xs hover:underline"
          href={`/feature/${data.autoTask.sourceFeatureId}`}
        >
          {t('featureWork.autoTaskSource')}
        </Link>
      ) : null}
      {data.discovery ? (
        <section className="space-y-1">
          <h3 className="text-sm font-semibold">{t('featureWork.sourceEvidence')}</h3>
          <ul className="text-muted-foreground space-y-1 font-mono text-xs break-all">
            {data.discovery.evidencePaths.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
        </section>
      ) : null}
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
          onChange={(ids) => {
            parentsDirty.current = true;
            setParents(ids);
          }}
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
