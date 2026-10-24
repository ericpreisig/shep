import { listMindMapProjects } from '@/app/actions/project-mind-map';
import { ProjectMindMapPanel } from '@/components/features/project-mind-map/project-mind-map-panel';

export const dynamic = 'force-dynamic';

export default async function ProjectMindMapPage({
  searchParams,
}: {
  searchParams: Promise<{ repository?: string }>;
}) {
  const [projects, query] = await Promise.all([listMindMapProjects(), searchParams]);
  const selected = projects.some((project) => project.id === query.repository)
    ? query.repository
    : projects[0]?.id;
  return <ProjectMindMapPanel projects={projects} initialRepositoryId={selected} />;
}
