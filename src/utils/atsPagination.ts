import type { ProjectItem } from '../types/resume';

/**
 * Keep concise ATS project entries intact when possible. A longer entry may
 * flow across pages at complete bullet boundaries so it does not strand large
 * white space at the end of an A4 page. This is a conservative content-length
 * heuristic; the browser remains responsible for final print pagination.
 */
export const MAX_ATS_WHOLE_PROJECT_CHARS = 350;

export function isLongAtsProject(
  project: Pick<ProjectItem, 'name' | 'role' | 'summary' | 'repoUrl' | 'techStack' | 'bullets'>
): boolean {
  const visibleBullets = project.bullets.filter((bullet) => Boolean(bullet.trim()));
  const textLength = [
    project.name,
    project.role,
    project.summary,
    project.repoUrl,
    ...project.techStack,
    ...visibleBullets,
  ].join('').trim().length;
  return textLength > MAX_ATS_WHOLE_PROJECT_CHARS || visibleBullets.length > 4;
}
