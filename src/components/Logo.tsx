import logoImage from "@/assets/privadinhos-online-logo.png";

export function Logo({ className = "h-8 sm:h-9" }: { className?: string }) {
  return (
    <img
      src={logoImage}
      alt="Privadinhos Online"
      className={`block w-auto max-w-full object-contain ${className}`}
    />
  );
}
