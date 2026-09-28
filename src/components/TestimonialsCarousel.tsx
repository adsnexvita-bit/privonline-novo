import { useRef } from "react";
import type { ModelTestimonial } from "@/lib/model-testimonials.functions";

export function TestimonialsCarousel({ items }: { items: ModelTestimonial[] }) {
  const carouselRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ active: false, startX: 0, scrollLeft: 0 });

  if (!items.length) return null;

  return (
    <section aria-labelledby="testimonials-title">
      <h2
        id="testimonials-title"
        className="mb-5 text-center text-lg font-bold tracking-[-0.02em] text-[#252525]"
      >
        Depoimentos Reais
      </h2>
      <div
        ref={carouselRef}
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse" || !carouselRef.current) return;
          dragRef.current = {
            active: true,
            startX: event.clientX,
            scrollLeft: carouselRef.current.scrollLeft,
          };
          carouselRef.current.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!dragRef.current.active || !carouselRef.current) return;
          carouselRef.current.scrollLeft =
            dragRef.current.scrollLeft - (event.clientX - dragRef.current.startX);
        }}
        onPointerUp={() => {
          dragRef.current.active = false;
        }}
        onPointerCancel={() => {
          dragRef.current.active = false;
        }}
        className="flex cursor-grab touch-pan-x snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-smooth pb-2 motion-reduce:scroll-auto active:cursor-grabbing [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="aspect-[4/3] w-[88%] shrink-0 snap-center overflow-hidden rounded-2xl bg-muted first:snap-start sm:w-[78%]"
          >
            <img
              src={item.imageUrl}
              alt="Depoimento real"
              loading="lazy"
              decoding="async"
              draggable={false}
              className="h-full w-full select-none object-cover"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
