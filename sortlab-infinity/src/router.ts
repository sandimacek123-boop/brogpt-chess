export type Route = 'visualizer' | 'battle' | 'algorithms' | 'settings';

export const ROUTES: { id: Route; label: string }[] = [
  { id: 'visualizer', label: 'Visualizer' },
  { id: 'battle', label: 'Battle' },
  { id: 'algorithms', label: 'Algorithms' },
  { id: 'settings', label: 'Settings' },
];

export function readRoute(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  return (ROUTES.find((r) => r.id === h)?.id ?? 'visualizer') as Route;
}

export function navigate(r: Route) {
  window.location.hash = r === 'visualizer' ? '/' : `/${r}`;
}
