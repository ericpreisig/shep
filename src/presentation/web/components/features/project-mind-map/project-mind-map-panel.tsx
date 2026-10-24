'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import {
  ChevronDown,
  ChevronRight,
  Expand,
  FoldVertical,
  Loader2,
  MessageSquare,
  Network,
  RefreshCw,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  getProjectMindMap,
  analyzeProject,
  type MindMapPageData,
  type MindMapProjectOption,
} from '@/app/actions/project-mind-map';
import { buildMindMapGraph, type MindMapNodeData } from './build-mind-map-graph';

function MindMapNode({ data }: NodeProps<Node<MindMapNodeData>>) {
  const { t } = useTranslation('web');
  return (
    <div
      className={cn(
        'bg-card text-card-foreground rounded-xl border px-4 py-3 shadow-sm',
        data.kind === 'project' && 'border-primary/40 bg-primary/5',
        data.kind === 'topic' && 'border-sky-500/30'
      )}
    >
      {data.kind !== 'project' && (
        <Handle
          type="target"
          position={Position.Left}
          className="!bg-muted-foreground !size-1.5 !border-0"
        />
      )}
      <div className="flex items-start gap-2">
        {data.kind === 'topic' && (
          <button
            className="nodrag nopan hover:bg-muted mt-0.5 rounded p-0.5"
            aria-label={t(data.collapsed ? 'mindMap.expandTopic' : 'mindMap.collapseTopic', {
              topic: data.label,
            })}
            aria-expanded={!data.collapsed}
            onClick={() => data.onToggle?.(data.topicId!)}
          >
            {data.collapsed ? (
              <ChevronRight className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
          </button>
        )}
        <div className="min-w-0 flex-1">
          {data.featureId ? (
            <Link
              className="nodrag nopan block text-sm leading-snug font-medium hover:underline"
              href={`/feature/${data.featureId}`}
            >
              {data.label}
            </Link>
          ) : (
            <span className="block text-sm leading-snug font-semibold">{data.label}</span>
          )}
          <div className="text-muted-foreground mt-1.5 flex items-center justify-between gap-2 text-[11px]">
            <span>
              {data.kind === 'feature'
                ? data.lifecycle
                : t('mindMap.taskCount', { count: data.count })}
            </span>
            {data.featureId ? (
              <Link
                className="nodrag nopan hover:text-foreground flex items-center gap-1"
                href={`/chats/${data.featureId}`}
              >
                <MessageSquare className="size-3" />
                {t('mindMap.chat')}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
      {data.kind !== 'feature' && (
        <Handle
          type="source"
          position={Position.Right}
          className="!bg-muted-foreground !size-1.5 !border-0"
        />
      )}
    </div>
  );
}
const NODE_TYPES = { mindMap: MindMapNode };

export interface ProjectMindMapPanelProps {
  projects: MindMapProjectOption[];
  initialRepositoryId?: string;
  initialData?: MindMapPageData;
  load?: typeof getProjectMindMap;
}

export function ProjectMindMapPanel({
  projects,
  initialRepositoryId,
  initialData,
  load = getProjectMindMap,
}: ProjectMindMapPanelProps) {
  const { t } = useTranslation('web');
  const [selected, setSelected] = useState(initialRepositoryId ?? projects[0]?.id ?? '');
  const [view, setView] = useState(initialData);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!initialData);
  const [startingAnalysis, setStartingAnalysis] = useState(false);
  const request = useRef(0);
  const initialized = useRef('');

  const refresh = useCallback(
    async (force = false) => {
      if (!selected) return;
      const version = ++request.current;
      try {
        const result = await load(selected, force);
        if (version !== request.current) return;
        if (result.error) {
          setError(result.error);
          return;
        }
        if (result.data) {
          setView(result.data);
          setError('');
        }
      } catch (reason) {
        if (version === request.current) setError(String(reason));
      } finally {
        if (version === request.current) setLoading(false);
      }
    },
    [selected, load]
  );

  useEffect(() => {
    setLoading(true);
    setView(initialData?.repository.id === selected ? initialData : undefined);
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 5000);
    return () => {
      clearInterval(timer);
    };
  }, [selected, refresh, initialData]);

  useEffect(() => {
    if (!view || initialized.current === selected) return;
    initialized.current = selected;
    try {
      const saved = localStorage.getItem(`shep:mind-map:${selected}:collapsed`);
      setCollapsed(saved ? new Set(JSON.parse(saved) as string[]) : new Set());
    } catch {
      setCollapsed(new Set());
    }
  }, [view, selected]);

  const updateCollapsed = useCallback(
    (next: Set<string>) => {
      setCollapsed(next);
      try {
        localStorage.setItem(`shep:mind-map:${selected}:collapsed`, JSON.stringify([...next]));
      } catch {
        /* Storage may be unavailable. */
      }
    },
    [selected]
  );
  const toggle = useCallback(
    (id: string) => {
      const next = new Set(collapsed);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      updateCollapsed(next);
    },
    [collapsed, updateCollapsed]
  );
  const graph = useMemo(() => {
    if (!view) return { nodes: [], edges: [] };
    const result = buildMindMapGraph(
      view.repository.name,
      view.map.topics,
      view.features,
      collapsed,
      query
    );
    return {
      ...result,
      nodes: result.nodes.map((node) => ({ ...node, data: { ...node.data, onToggle: toggle } })),
    };
  }, [view, collapsed, query, toggle]);
  const visibleTasks = graph.nodes.filter((node) => node.data.kind === 'feature').length;

  return (
    <main
      className="bg-background flex h-full min-h-screen min-w-0 flex-col"
      data-testid="project-mind-map"
    >
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-5">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Network className="text-primary size-5" />
            {t('mindMap.title')}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('mindMap.description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label={t('mindMap.project')}
            className="bg-background h-9 max-w-56 rounded-md border px-3 text-sm"
            value={selected}
            onChange={(event) => {
              setSelected(event.target.value);
              setQuery('');
            }}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={!selected || startingAnalysis || view?.generating === true}
            onClick={async () => {
              setStartingAnalysis(true);
              setError('');
              try {
                const result = await analyzeProject(selected);
                if (result.error) setError(result.error);
                else await refresh();
              } catch (reason) {
                setError(String(reason));
              } finally {
                setStartingAnalysis(false);
              }
            }}
          >
            {view?.analyzing || startingAnalysis ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
            {t(
              view?.analyzing || startingAnalysis ? 'mindMap.analyzing' : 'mindMap.analyzeProject'
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!selected || view?.generating === true || loading}
            onClick={() => void refresh(true)}
          >
            <RefreshCw className={cn('size-4', view?.generating && 'animate-spin')} />
            {t('mindMap.regroup')}
          </Button>
        </div>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3">
        <div className="relative w-72">
          <Search className="text-muted-foreground absolute top-2.5 left-3 size-4" />
          <Input
            className="pl-9"
            placeholder={t('mindMap.search')}
            aria-label={t('mindMap.search')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {view?.generating ? (
            <span role="status" className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <Loader2 className="size-3.5 animate-spin" />
              {t(view.analyzing ? 'mindMap.analyzing' : 'mindMap.organizing')}
            </span>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => updateCollapsed(new Set())}>
            <Expand className="size-4" />
            {t('mindMap.expandAll')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => updateCollapsed(new Set(view?.map.topics.map((topic) => topic.id)))}
          >
            <FoldVertical className="size-4" />
            {t('mindMap.collapseAll')}
          </Button>
          {selected ? (
            <Link
              className="text-muted-foreground px-2 text-xs hover:underline"
              href={`/chats/repo-${selected}`}
            >
              {t('mindMap.projectChat')}
            </Link>
          ) : null}
        </div>
      </div>
      {error.length > 0 || Boolean(view?.error) ? (
        <div
          role="alert"
          className="border-b border-amber-500/20 bg-amber-500/5 px-6 py-2 text-sm text-amber-700 dark:text-amber-400"
        >
          {t('mindMap.keepLast')} {error.length > 0 ? error : view?.error}
        </div>
      ) : null}
      <div className="relative min-h-[520px] flex-1" style={{ height: 'calc(100vh - 220px)' }}>
        {loading && !view ? (
          <div
            role="status"
            className="text-muted-foreground flex h-full items-center justify-center gap-2"
          >
            <Loader2 className="size-5 animate-spin" />
            {t('mindMap.loading')}
          </div>
        ) : !view?.features.length ? (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3">
            <Network className="size-9 opacity-40" />
            <p>{t(projects.length ? 'mindMap.emptyTasks' : 'mindMap.emptyProjects')}</p>
          </div>
        ) : (
          <ReactFlow
            key={graph.nodes.map((node) => node.id).join('|')}
            nodes={graph.nodes}
            edges={graph.edges}
            nodeTypes={NODE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.05}
            maxZoom={1.6}
            nodesConnectable={false}
            nodesDraggable={false}
            deleteKeyCode={null}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        )}
      </div>
      <footer className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 border-t px-6 py-2 text-xs">
        <span>
          {t('mindMap.coverage', {
            total: view?.features.length ?? 0,
            visible: visibleTasks,
            themes: view?.map.topics.length ?? 0,
          })}
        </span>
        {view?.analysis ? (
          <span>
            {t('mindMap.analysisSummary', {
              files: view.analysis.filesRead,
              added: view.analysis.featuresAdded,
            })}
          </span>
        ) : null}
        <span>{t('mindMap.evolving')}</span>
      </footer>
    </main>
  );
}
