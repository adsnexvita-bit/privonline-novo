import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { ImageOff } from "lucide-react";
import { LoadingWave } from "@/components/ui/RouteLoadingOverlay";

type ProgressiveImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  priority?: boolean;
};

export function ProgressiveImage({
  className = "",
  priority = false,
  alt,
  onLoad,
  onError,
  ...props
}: ProgressiveImageProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [currentSrc, setCurrentSrc] = useState(props.src);

  useEffect(() => {
    setStatus("loading");
    setAttempt(0);
    setCurrentSrc(props.src);
  }, [props.src]);

  function withRetryParam(src: typeof props.src, retryAttempt: number) {
    if (typeof src !== "string" || !src || src.startsWith("data:") || src.startsWith("blob:")) {
      return src;
    }
    const separator = src.includes("?") ? "&" : "?";
    return `${src}${separator}img_retry=${retryAttempt}-${Date.now()}`;
  }

  return (
    <>
      {status !== "loaded" ? (
        <span
          className="progressive-image-loading pointer-events-none absolute inset-0 z-[1] grid place-items-center"
          aria-hidden="true"
        >
          {status === "loading" ? (
            <LoadingWave className="route-loading-wave-compact" />
          ) : (
            <ImageOff className="h-6 w-6 text-muted-foreground" />
          )}
        </span>
      ) : null}
      <img
        key={typeof currentSrc === "string" ? currentSrc : undefined}
        {...props}
        src={currentSrc}
        alt={alt}
        loading={priority ? "eager" : (props.loading ?? "lazy")}
        decoding="async"
        fetchPriority={priority ? "high" : props.fetchPriority}
        referrerPolicy={props.referrerPolicy ?? "no-referrer"}
        onLoad={(event) => {
          setStatus("loaded");
          onLoad?.(event);
        }}
        onError={(event) => {
          if (attempt < 2 && props.src) {
            const nextAttempt = attempt + 1;
            setAttempt(nextAttempt);
            setStatus("loading");
            setCurrentSrc(withRetryParam(props.src, nextAttempt));
            return;
          }
          setStatus("error");
          onError?.(event);
        }}
        className={`${className} [transition-property:opacity,transform] duration-300 ${
          status === "loaded" ? "opacity-100" : "opacity-0"
        }`}
      />
    </>
  );
}
