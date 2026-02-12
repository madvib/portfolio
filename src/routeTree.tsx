import { rootRoute } from './routes/__root';
import { indexRoute } from './routes/index';
import { minigameRoute } from './routes/minigame';
import { blogIndexRoute } from './routes/blog';
import { blogPostRoute } from './routes/blog.$postId';

// Route tree for TanStack Router
export const routeTree = rootRoute.addChildren([
  indexRoute,
  minigameRoute,
  blogIndexRoute,
  blogPostRoute,
]);
