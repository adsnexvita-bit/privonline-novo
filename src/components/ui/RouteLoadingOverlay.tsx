type RouteLoadingOverlayProps = {
  visible?: boolean;
  label?: string;
  embedded?: boolean;
};

export function LoadingWave({ className = "" }: { className?: string }) {
  return (
    <span className={`route-loading-wave ${className}`} aria-hidden="true">
      {Array.from({ length: 7 }).map((_, index) => (
        <span key={index} style={{ animationDelay: `${index * 90}ms` }} />
      ))}
    </span>
  );
}

export function RouteLoadingOverlay({
  visible = true,
  label = "Carregando conteúdo",
  embedded = false,
}: RouteLoadingOverlayProps) {
  return (
    <div
      className={`route-loading-overlay ${embedded ? "absolute" : "fixed"} inset-0 z-[200] grid min-h-[100dvh] place-items-center overflow-hidden bg-background/20 px-4 backdrop-blur-md`}
      role="status"
      aria-live="polite"
      aria-label={label}
      aria-hidden={!visible}
      data-visible={visible ? "true" : "false"}
      data-route-loading-overlay
    >
      <LoadingWave />
    </div>
  );
}
