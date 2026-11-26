// Downscale and JPEG-encode a photo for sending to the AI.
// Returns { data: base64 (no prefix), mimeType, previewUrl }.
export function shrinkImage(file, { maxDim = 1280, maxBytes = 600 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Couldn't read ${file.name || 'photo'}`)) }
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      const scale = Math.min(1, maxDim / Math.max(width, height))
      width = Math.round(width * scale)
      height = Math.round(height * scale)

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)

      let quality = 0.82
      let dataUrl = canvas.toDataURL('image/jpeg', quality)
      while (dataUrl.length * 0.75 > maxBytes && quality > 0.4) {
        quality -= 0.1
        dataUrl = canvas.toDataURL('image/jpeg', quality)
      }
      resolve({ data: dataUrl.split(',')[1], mimeType: 'image/jpeg', previewUrl: dataUrl })
    }
    img.src = url
  })
}
