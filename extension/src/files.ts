/** Save a file to the user's device through a download. */
export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** iPad: the share sheet (save to Files / Working Copy). Elsewhere: download. */
export async function shareOrDownload(file: File): Promise<void> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return;
      }
      // Sharing failed for another reason: fall back to a download.
    }
  }
  download(file, file.name);
}

/** Ask the user for one file. Resolves undefined if they cancel. */
export function pickFile(accept: string): Promise<File | undefined> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files?.[0]), { once: true });
    input.addEventListener('cancel', () => resolve(undefined), { once: true });
    input.click();
  });
}
