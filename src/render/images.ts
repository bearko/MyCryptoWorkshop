const cache = new Map<string, HTMLImageElement>();

/** Resolves a catalog asset path (e.g. `mch/Image/...`) against the deployed base URL. */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}

export function img(path: string): HTMLImageElement {
  let im = cache.get(path);
  if (!im) {
    im = new Image();
    im.decoding = 'async';
    im.src = assetUrl(path);
    cache.set(path, im);
  }
  return im;
}

export const ready = (im: HTMLImageElement) => im.complete && im.naturalWidth > 0;

export function preload(paths: string[]): Promise<void> {
  return Promise.all(
    paths.map(
      (p) =>
        new Promise<void>((resolve) => {
          const im = img(p);
          if (ready(im)) return resolve();
          im.addEventListener('load', () => resolve(), { once: true });
          im.addEventListener('error', () => resolve(), { once: true });
        }),
    ),
  ).then(() => undefined);
}
