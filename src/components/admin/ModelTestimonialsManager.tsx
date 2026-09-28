import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Trash2 } from "lucide-react";
import {
  addModelTestimonialAdmin,
  deleteModelTestimonialAdmin,
  listModelTestimonialsAdmin,
  reorderModelTestimonialsAdmin,
  type ModelTestimonial,
} from "@/lib/model-testimonials.functions";
import {
  abortR2MultipartMediaUpload,
  completeR2MultipartMediaUpload,
  prepareR2AssetUpload,
  prepareR2MultipartPartUpload,
} from "@/lib/media-storage.functions";
import { uploadFileToR2 } from "@/lib/r2-upload";
import { ALLOWED_IMAGE_TYPES } from "@/lib/image-processing";

export function ModelTestimonialsManager({ modelId }: { modelId: string }) {
  const [items, setItems] = useState<ModelTestimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listTestimonials = useServerFn(listModelTestimonialsAdmin);
  const addTestimonial = useServerFn(addModelTestimonialAdmin);
  const deleteTestimonial = useServerFn(deleteModelTestimonialAdmin);
  const reorderTestimonials = useServerFn(reorderModelTestimonialsAdmin);
  const prepareUpload = useServerFn(prepareR2AssetUpload);
  const preparePart = useServerFn(prepareR2MultipartPartUpload);
  const completeMultipart = useServerFn(completeR2MultipartMediaUpload);
  const abortMultipart = useServerFn(abortR2MultipartMediaUpload);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      setItems(await listTestimonials({ data: { modelId } }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os depoimentos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [modelId]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files);
    if (selected.some((file) => !ALLOWED_IMAGE_TYPES.includes(file.type as never))) {
      setError("Envie somente imagens JPG, PNG ou WEBP.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      for (const file of selected) {
        const prepared = await prepareUpload({
          data: {
            asset: "model-asset",
            filename: file.name,
            contentType: file.type,
            size: file.size,
          },
        });
        await uploadFileToR2({
          prepared,
          file,
          contentType: file.type,
          getPartUrl: (data) => preparePart({ data }),
          completeMultipart: (data) => completeMultipart({ data }),
          abortMultipart: (data) => abortMultipart({ data }),
        });
        await addTestimonial({ data: { modelId, imagePath: prepared.reference } });
      }
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível enviar os depoimentos.");
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await deleteTestimonial({ data: { modelId, id } });
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível remover o depoimento.");
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const next = [...items];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setItems(next);
    try {
      await reorderTestimonials({ data: { modelId, ids: next.map((item) => item.id) } });
    } catch (cause) {
      setItems(items);
      setError(cause instanceof Error ? cause.message : "Não foi possível ordenar os depoimentos.");
    }
  }

  return (
    <div>
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary/90 focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2">
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        Adicionar imagens
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={uploading}
          onChange={(event) => {
            void upload(event.target.files);
            event.target.value = "";
          }}
          className="sr-only"
        />
      </label>

      {error ? (
        <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="grid min-h-52 place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Carregando" />
        </div>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item, index) => (
            <article key={item.id} className="overflow-hidden rounded-2xl bg-muted">
              <img src={item.imageUrl} alt="Depoimento" className="aspect-[4/3] w-full object-cover" />
              <div className="flex items-center justify-end gap-1 p-2">
                <button
                  type="button"
                  onClick={() => void move(index, -1)}
                  disabled={index === 0}
                  aria-label="Mover depoimento para trás"
                  className="grid h-10 w-10 place-items-center rounded-xl text-muted-foreground transition hover:bg-white disabled:opacity-30"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void move(index, 1)}
                  disabled={index === items.length - 1}
                  aria-label="Mover depoimento para frente"
                  className="grid h-10 w-10 place-items-center rounded-xl text-muted-foreground transition hover:bg-white disabled:opacity-30"
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void remove(item.id)}
                  aria-label="Remover depoimento"
                  className="grid h-10 w-10 place-items-center rounded-xl text-destructive transition hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
