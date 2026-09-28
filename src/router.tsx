import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { shouldRetryQuery, transientRetryDelay } from "./lib/error-recovery";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: shouldRetryQuery,
        retryDelay: transientRetryDelay,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadDelay: 80,
    defaultPreloadStaleTime: 5 * 60 * 1000,
  });

  return router;
};
