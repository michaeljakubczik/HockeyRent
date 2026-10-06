export function photoDimensions(width: number, height: number) {
  const scale = Math.min(1, 800 / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export async function compressEquipmentPhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Bitte eine Bilddatei auswählen.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Das Foto ist zu groß. Bitte ein Bild unter 20 MB auswählen.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Das Foto konnte nicht gelesen werden. Bitte JPEG, PNG oder WebP verwenden.'));
      image.src = url;
    });
    const { width, height } = photoDimensions(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Das Foto konnte nicht verarbeitet werden.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    // Prefer WebP where supported, otherwise canvas uses PNG; use JPEG fallback.
    let result = canvas.toDataURL('image/webp', 0.72);
    if (!result.startsWith('data:image/webp')) result = canvas.toDataURL('image/jpeg', 0.68);
    for (const quality of [0.58, 0.45, 0.32]) {
      if (result.length <= 180000) break;
      result = canvas.toDataURL(result.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg', quality);
    }
    if (result.length > 250000) throw new Error('Das Foto lässt sich nicht ausreichend verkleinern. Bitte ein anderes Bild auswählen.');
    return result;
  } finally { URL.revokeObjectURL(url); }
}
