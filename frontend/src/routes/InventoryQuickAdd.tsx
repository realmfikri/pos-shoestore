import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../modules/auth/AuthProvider'
import { Spinner } from '../components/ui/Spinner'

type Step = 'details' | 'variants' | 'review' | 'success'

interface BrandOption {
  id: string
  name: string
  description?: string | null
}

interface CreatedBrandResponse {
  id: string
  name: string
}

interface CreatedProductResponse {
  id: string
  name: string
  category: string | null
}

interface CreatedVariantResponse {
  id: string
  sku: string
  size: string | null
  color: string | null
}

interface PhotoCapture {
  id: string
  previewUrl: string
  blob: Blob
  fileName: string
  contentType: string
}

interface VariantPreviewRow {
  size: string
  quantity: number
  sku: string
}

interface SuccessSummary {
  productId: string
  productName: string
  brandName: string
  variants: Array<VariantPreviewRow & { id: string }>
  photoCount: number
}

const CATEGORY_OPTIONS = [
  'Sneakers',
  'Running',
  'Casual',
  'Boots',
  'Sandals',
  'Formal',
  'Kids',
]

const SIZE_SCALE_OPTIONS = [
  { id: 'EU', label: 'EU 36-45', sizes: ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45'] },
  { id: 'US_MEN', label: 'US Men 6-13', sizes: ['6', '7', '8', '9', '10', '11', '12', '13'] },
  { id: 'US_WOMEN', label: 'US Women 5-12', sizes: ['5', '6', '7', '8', '9', '10', '11', '12'] },
  { id: 'UK', label: 'UK 5-12', sizes: ['5', '6', '7', '8', '9', '10', '11', '12'] },
  { id: 'KIDS', label: 'Kids 28-35', sizes: ['28', '29', '30', '31', '32', '33', '34', '35'] },
  { id: 'CUSTOM', label: 'Custom sizes', sizes: [] },
] as const

const currencyFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

const toCode = (value: string, fallback: string, length: number) => {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  if (!normalized) {
    return fallback
  }
  return normalized.slice(0, length).padEnd(length, fallback.charAt(0))
}

const buildSku = (brand: string, model: string, size: string, index: number) => {
  const brandCode = toCode(brand, 'BRD', 3)
  const modelCode = toCode(model, 'MODL', 4)
  const sizeCode = size.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'SIZE'
  return `${brandCode}-${modelCode}-${sizeCode}-${String(index + 1).padStart(2, '0')}`
}

const MAX_PHOTOS = 8

const createCapture = (blob: Blob, fileName: string): PhotoCapture => ({
  id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
  previewUrl: URL.createObjectURL(blob),
  blob,
  fileName,
  contentType: blob.type || 'image/jpeg',
})

export const InventoryQuickAdd = () => {
  const navigate = useNavigate()
  const { authorizedFetch } = useAuth()

  const [step, setStep] = useState<Step>('details')
  const [brandSearch, setBrandSearch] = useState('')
  const [details, setDetails] = useState({
    brandId: '',
    brandName: '',
    modelName: '',
    category: '',
    color: '',
    material: '',
    price: '',
  })
  const [sizeScale, setSizeScale] = useState<(typeof SIZE_SCALE_OPTIONS)[number]['id']>('EU')
  const [customSize, setCustomSize] = useState('')
  const [variantSelections, setVariantSelections] = useState<Record<string, { quantity: number }>>({})
  const [captures, setCaptures] = useState<PhotoCapture[]>([])
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [isCapturingPhoto, setIsCapturingPhoto] = useState(false)
  const [submissionProgress, setSubmissionProgress] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [successSummary, setSuccessSummary] = useState<SuccessSummary | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const capturesRef = useRef<PhotoCapture[]>([])

  const brandQuery = useQuery<BrandOption[]>({
    queryKey: ['brands', brandSearch],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (brandSearch.trim()) {
        params.set('search', brandSearch.trim())
      }
      const queryString = params.toString()
      const response = await authorizedFetch(`/api/brands${queryString ? `?${queryString}` : ''}`)
      const payload = (await response.json().catch(() => null)) as BrandOption[] | { message?: string } | null

      if (!response.ok || !payload || !Array.isArray(payload)) {
        const message = (payload as { message?: string } | null)?.message ?? 'Unable to load brands'
        throw new Error(message)
      }

      return payload
    },
    staleTime: 120_000,
  })

  const selectedBrand = useMemo(() => {
    if (!details.brandId) {
      return null
    }
    return brandQuery.data?.find((brand) => brand.id === details.brandId) ?? null
  }, [brandQuery.data, details.brandId])

  useEffect(() => {
    if (selectedBrand) {
      setDetails((prev) => ({ ...prev, brandName: '' }))
    }
  }, [selectedBrand])

  useEffect(() => {
    if (sizeScale === 'CUSTOM') {
      return
    }

    const option = SIZE_SCALE_OPTIONS.find((item) => item.id === sizeScale)
    const allowedSizes = new Set(option?.sizes ?? [])
    setVariantSelections((prev) => {
      const next: Record<string, { quantity: number }> = {}
      Object.entries(prev).forEach(([size, value]) => {
        if (allowedSizes.has(size)) {
          next[size] = value
        }
      })
      return next
    })
  }, [sizeScale])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setIsCameraActive(false)
  }, [])

  const startCamera = useCallback(async () => {
    setCameraError(null)
    if (!('mediaDevices' in navigator) || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Perangkat ini tidak mendukung kamera langsung. Gunakan unggah foto manual.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => undefined)
      }
      setIsCameraActive(true)
    } catch (error) {
      console.error('Unable to start camera', error)
      setCameraError('Tidak dapat mengakses kamera. Pastikan izin kamera diberikan.')
    }
  }, [])

  useEffect(() => {
    capturesRef.current = captures
  }, [captures])

  useEffect(() => () => {
    stopCamera()
    capturesRef.current.forEach((capture) => URL.revokeObjectURL(capture.previewUrl))
  }, [stopCamera])

  const handleCapturePhoto = useCallback(async () => {
    if (!videoRef.current || isCapturingPhoto) {
      return
    }
    if (captures.length >= MAX_PHOTOS) {
      setCameraError(`Maksimum ${MAX_PHOTOS} foto per produk.`)
      return
    }

    setIsCapturingPhoto(true)
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const context = canvas.getContext('2d')
    if (!context) {
      setCameraError('Tidak dapat menangkap gambar dari kamera.')
      setIsCapturingPhoto(false)
      return
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    if (!blob) {
      setCameraError('Gagal menyimpan foto. Coba lagi.')
      setIsCapturingPhoto(false)
      return
    }
    const capture = createCapture(blob, `quick-add-${Date.now()}.jpg`)
    setCaptures((prev) => [...prev, capture])
    setIsCapturingPhoto(false)
  }, [captures.length, isCapturingPhoto])

  const handleFileUpload = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files
      if (!files) {
        return
      }
      const remainingSlots = MAX_PHOTOS - captures.length
      const selectedFiles = Array.from(files).slice(0, remainingSlots)
      const newCaptures = selectedFiles.map((file) => createCapture(file, file.name))
      setCaptures((prev) => [...prev, ...newCaptures])
      event.target.value = ''
    },
    [captures.length],
  )

  const removeCapture = useCallback((id: string) => {
    setCaptures((prev) => {
      const remaining = prev.filter((capture) => capture.id !== id)
      const removed = prev.find((capture) => capture.id === id)
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl)
      }
      return remaining
    })
  }, [])

  const toggleSize = useCallback((size: string) => {
    setVariantSelections((prev) => {
      const next = { ...prev }
      if (next[size]) {
        delete next[size]
      } else {
        next[size] = { quantity: 0 }
      }
      return next
    })
  }, [])

  const updateVariantQuantity = useCallback((size: string, quantity: number) => {
    setVariantSelections((prev) => ({
      ...prev,
      [size]: { quantity },
    }))
  }, [])

  const variantPreview = useMemo<VariantPreviewRow[]>(() => {
    const brandName = selectedBrand?.name ?? details.brandName
    const modelName = details.modelName
    return Object.entries(variantSelections)
      .map(([size, value], index) => ({
        size,
        quantity: value.quantity,
        sku: buildSku(brandName || 'Brand', modelName || 'Model', size, index),
      }))
      .sort((a, b) => a.size.localeCompare(b.size, undefined, { numeric: true, sensitivity: 'base' }))
  }, [details.brandName, details.modelName, selectedBrand?.name, variantSelections])

  const validateDetailsStep = useCallback(() => {
    const errors: string[] = []
    const brandLabel = selectedBrand?.name ?? details.brandName.trim()
    if (!brandLabel) {
      errors.push('Pilih brand atau buat brand baru terlebih dahulu.')
    }
    if (!details.modelName.trim()) {
      errors.push('Nama model sepatu wajib diisi.')
    }
    const parsedPrice = Number.parseFloat(details.price)
    if (Number.isNaN(parsedPrice) || parsedPrice <= 0) {
      errors.push('Harga jual harus diisi dan lebih dari 0.')
    }
    return errors
  }, [details.brandName, details.modelName, details.price, selectedBrand?.name])

  const validateVariantsStep = useCallback(() => {
    const errors: string[] = []
    if (Object.keys(variantSelections).length === 0) {
      errors.push('Pilih minimal satu ukuran untuk membuat varian.')
    }
    Object.entries(variantSelections).forEach(([size, value]) => {
      if (!Number.isInteger(value.quantity) || value.quantity < 0) {
        errors.push(`Stok awal untuk ukuran ${size} harus berupa angka bulat ≥ 0.`)
      }
    })
    return errors
  }, [variantSelections])

  const goToVariants = (event: FormEvent) => {
    event.preventDefault()
    const errors = [...validateDetailsStep()]
    if (errors.length > 0) {
      setSubmitError(errors.join(' '))
      return
    }
    setSubmitError(null)
    setStep('variants')
  }

  const goToReview = (event: FormEvent) => {
    event.preventDefault()
    const errors = [...validateDetailsStep(), ...validateVariantsStep()]
    if (errors.length > 0) {
      setSubmitError(errors.join(' '))
      return
    }
    setSubmitError(null)
    setStep('review')
  }

  const priceInCents = useMemo(() => {
    const parsed = Number.parseFloat(details.price)
    if (Number.isNaN(parsed)) {
      return null
    }
    return Math.round(parsed * 100)
  }, [details.price])

  const resetForm = useCallback(() => {
    setDetails({
      brandId: '',
      brandName: '',
      modelName: '',
      category: '',
      color: '',
      material: '',
      price: '',
    })
    setBrandSearch('')
    setSizeScale('EU')
    setVariantSelections({})
    setCaptures((prev) => {
      prev.forEach((capture) => URL.revokeObjectURL(capture.previewUrl))
      return []
    })
    setSuccessSummary(null)
    setStep('details')
    setSubmitError(null)
    setSubmissionProgress(null)
  }, [])

  const handleSubmit = useCallback(async () => {
    const detailErrors = validateDetailsStep()
    const variantErrors = validateVariantsStep()
    if (detailErrors.length > 0 || variantErrors.length > 0 || priceInCents === null) {
      setSubmitError([...detailErrors, ...variantErrors].join(' '))
      return
    }

    setSubmitError(null)
    setSubmissionProgress('Menyimpan brand dan produk…')

    try {
      const brandLabel = selectedBrand?.name ?? details.brandName.trim()
      let brandId = details.brandId
      let resolvedBrandName = brandLabel

      if (!brandId) {
        const createBrandResponse = await authorizedFetch('/api/brands', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: resolvedBrandName }),
        })
        const payload = (await createBrandResponse.json().catch(() => null)) as CreatedBrandResponse | { message?: string } | null
        if (!createBrandResponse.ok || !payload || !('id' in payload)) {
          const message = (payload as { message?: string } | null)?.message ?? 'Gagal membuat brand baru.'
          throw new Error(message)
        }
        brandId = payload.id
        resolvedBrandName = payload.name
      }

      setSubmissionProgress('Mencatat produk baru…')
      const productResponse = await authorizedFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: details.modelName.trim(),
          brandId,
          category: details.category || null,
          description: details.material ? `Material: ${details.material}` : null,
          tags: [details.color, details.material].filter(Boolean),
        }),
      })
      const productPayload = (await productResponse.json().catch(() => null)) as CreatedProductResponse | { message?: string } | null
      if (!productResponse.ok || !productPayload || !('id' in productPayload)) {
        const message = (productPayload as { message?: string } | null)?.message ?? 'Gagal membuat produk.'
        throw new Error(message)
      }

      const createdVariants: Array<VariantPreviewRow & { id: string }> = []
      for (let index = 0; index < variantPreview.length; index += 1) {
        const variant = variantPreview[index]
        setSubmissionProgress(`Membuat varian ${index + 1} dari ${variantPreview.length}…`)
        const variantResponse = await authorizedFetch('/api/variants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: productPayload.id,
            sku: variant.sku,
            size: variant.size,
            color: details.color || null,
            priceCents: priceInCents,
          }),
        })
        const variantPayload = (await variantResponse.json().catch(() => null)) as CreatedVariantResponse | { message?: string } | null
        if (!variantResponse.ok || !variantPayload || !('id' in variantPayload)) {
          const message = (variantPayload as { message?: string } | null)?.message ?? 'Gagal membuat varian.'
          throw new Error(message)
        }
        createdVariants.push({ ...variant, id: variantPayload.id })
      }

      for (let index = 0; index < createdVariants.length; index += 1) {
        const variant = createdVariants[index]
        if (variant.quantity > 0) {
          setSubmissionProgress(`Mencatat stok awal ukuran ${variant.size}…`)
          const stockResponse = await authorizedFetch('/api/stock/initial', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              variantId: variant.id,
              quantity: variant.quantity,
              reason: 'Quick add initial stock',
            }),
          })
          if (!stockResponse.ok) {
            const stockPayload = (await stockResponse.json().catch(() => null)) as { message?: string } | null
            const message = stockPayload?.message ?? 'Gagal mencatat stok awal.'
            throw new Error(message)
          }
        }
      }

      if (captures.length > 0) {
        for (let index = 0; index < captures.length; index += 1) {
          const capture = captures[index]
          setSubmissionProgress(`Mengunggah foto ${index + 1} dari ${captures.length}…`)
          const signedResponse = await authorizedFetch('/api/media/signed-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productId: productPayload.id,
              fileName: capture.fileName,
              contentType: capture.contentType,
            }),
          })
          const signedPayload = (await signedResponse.json().catch(() => null)) as
            | { mediaId: string; uploadUrl: string }
            | { message?: string }
            | null
          if (!signedResponse.ok || !signedPayload || !('mediaId' in signedPayload)) {
            const message = (signedPayload as { message?: string } | null)?.message ?? 'Gagal meminta URL unggahan.'
            throw new Error(message)
          }

          const uploadResponse = await fetch(signedPayload.uploadUrl, {
            method: 'PUT',
            body: capture.blob,
            headers: { 'Content-Type': capture.contentType },
          })
          if (!uploadResponse.ok) {
            throw new Error('Gagal mengunggah foto ke penyimpanan.')
          }

          const completeResponse = await authorizedFetch(`/api/media/${signedPayload.mediaId}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sizeBytes: capture.blob.size }),
          })
          if (!completeResponse.ok) {
            const completePayload = (await completeResponse.json().catch(() => null)) as { message?: string } | null
            const message = completePayload?.message ?? 'Gagal menyelesaikan unggahan foto.'
            throw new Error(message)
          }
        }
      }

      stopCamera()
      setSubmissionProgress(null)
      setSuccessSummary({
        productId: productPayload.id,
        productName: productPayload.name,
        brandName: resolvedBrandName,
        variants: createdVariants,
        photoCount: captures.length,
      })
      setStep('success')
    } catch (error) {
      console.error('Quick add failed', error)
      setSubmissionProgress(null)
      if (error instanceof Error) {
        setSubmitError(error.message)
      } else {
        setSubmitError('Terjadi kesalahan tak terduga. Coba lagi.')
      }
    }
  }, [
    authorizedFetch,
    captures,
    details.brandId,
    details.brandName,
    details.category,
    details.color,
    details.material,
    details.modelName,
    priceInCents,
    selectedBrand?.name,
    stopCamera,
    validateDetailsStep,
    validateVariantsStep,
    variantPreview,
  ])

  const renderCameraSection = () => (
    <section className="rounded-3xl border border-ink-100 bg-white/95 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-brand-dark">Tambah foto produk</h3>
          <p className="text-xs text-ink-500">Ambil beberapa foto untuk membantu tim toko mengenali barang saat pemeriksaan stok.</p>
        </div>
        <button
          type="button"
          className="rounded-full border border-ink-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ink-500 transition hover:border-brand-primary hover:text-brand-primary"
          onClick={() => (isCameraActive ? stopCamera() : startCamera())}
        >
          {isCameraActive ? 'Matikan kamera' : 'Aktifkan kamera'}
        </button>
      </div>
      <div className="mt-4 space-y-4">
        {cameraError ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{cameraError}</p> : null}
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-3">
            <div className="relative overflow-hidden rounded-2xl border border-dashed border-ink-200 bg-ink-50/60">
              <video ref={videoRef} playsInline muted className="aspect-video w-full bg-black object-cover" />
              {!isCameraActive ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 p-4 text-center text-sm text-white">
                  <p>Aktifkan kamera untuk memotret langsung dari perangkat Anda.</p>
                  <p className="text-xs text-white/70">Pengambilan foto bekerja paling baik di perangkat mobile dengan kamera belakang.</p>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={handleCapturePhoto}
              disabled={!isCameraActive || isCapturingPhoto}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-primary px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-secondary disabled:cursor-not-allowed disabled:bg-brand-primary/50"
            >
              {isCapturingPhoto ? 'Mengambil…' : 'Ambil foto'}
            </button>
          </div>
          <div className="flex flex-col gap-3">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-ink-200 bg-white/90 p-4 text-center text-sm text-ink-500 transition hover:border-brand-primary hover:text-brand-primary">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="sr-only"
                onChange={handleFileUpload}
              />
              <span className="font-semibold text-brand-dark">Unggah dari galeri</span>
              <span className="text-xs">Format JPG/PNG hingga {Math.max(0, MAX_PHOTOS - captures.length)} foto lagi</span>
            </label>
            {captures.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-2">
                {captures.map((capture) => (
                  <div key={capture.id} className="group relative overflow-hidden rounded-xl border border-ink-200">
                    <img src={capture.previewUrl} alt="Preview produk" className="aspect-square w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeCapture(capture.id)}
                      className="absolute right-2 top-2 hidden rounded-full bg-black/70 px-2 py-1 text-xs font-semibold text-white group-hover:block"
                    >
                      Hapus
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-ink-100 bg-brand-surface/80 px-3 py-3 text-sm text-ink-500">
                Belum ada foto. Minimal satu foto close-up dan satu foto tampilan utuh membantu tim katalog memastikan data konsisten.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  )

  const brandSection = (
    <section className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-brand-dark">Brand</label>
        <p className="text-xs text-ink-500">Cari brand yang sudah ada atau ketik nama baru, lalu pilih tombol buat brand.</p>
      </div>
      <input
        type="search"
        value={brandSearch}
        onChange={(event) => setBrandSearch(event.target.value)}
        placeholder="Cari brand…"
        className="w-full rounded-2xl border border-ink-200 bg-white px-4 py-2 text-sm text-brand-dark shadow-inner focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
      />
      <div className="flex flex-wrap gap-2">
        {brandQuery.isLoading ? <Spinner className="text-sm" /> : null}
        {brandQuery.data?.slice(0, 8).map((brand) => (
          <button
            key={brand.id}
            type="button"
            onClick={() => setDetails((prev) => ({ ...prev, brandId: brand.id }))}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-secondary ${
              details.brandId === brand.id
                ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                : 'border-ink-200 text-ink-600 hover:border-brand-primary hover:text-brand-primary'
            }`}
          >
            {brand.name}
          </button>
        ))}
      </div>
      <div className="rounded-2xl border border-ink-100 bg-white/95 p-4 text-sm text-ink-600">
        <p className="font-semibold text-brand-dark">Brand baru?</p>
        <p className="text-xs text-ink-500">Masukkan nama brand dan klik gunakan brand baru untuk menyimpan saat submit.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            value={details.brandName}
            onChange={(event) => {
              setDetails((prev) => ({ ...prev, brandName: event.target.value, brandId: '' }))
            }}
            placeholder="Nama brand baru"
            className="w-full rounded-full border border-ink-200 bg-white px-4 py-2 text-sm text-brand-dark shadow-inner focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          />
          <button
            type="button"
            onClick={() => {
              if (details.brandName.trim()) {
                setDetails((prev) => ({ ...prev, brandId: '' }))
                setSubmitError(null)
              }
            }}
            className="rounded-full border border-brand-primary px-4 py-1.5 text-sm font-semibold text-brand-primary transition hover:bg-brand-primary hover:text-white"
          >
            Gunakan brand baru
          </button>
        </div>
      </div>
    </section>
  )

  const detailsStep = (
    <form onSubmit={goToVariants} className="space-y-6">
      {brandSection}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-brand-dark">Nama model</span>
          <input
            type="text"
            value={details.modelName}
            onChange={(event) => setDetails((prev) => ({ ...prev, modelName: event.target.value }))}
            placeholder="Contoh: Runner Flow"
            className="rounded-2xl border border-ink-200 bg-white px-4 py-2 text-sm text-brand-dark shadow-inner focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-brand-dark">Kategori</span>
          <select
            value={details.category}
            onChange={(event) => setDetails((prev) => ({ ...prev, category: event.target.value }))}
            className="rounded-2xl border border-ink-200 bg-white px-4 py-2 text-sm text-brand-dark shadow-inner focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          >
            <option value="">Pilih kategori</option>
            {CATEGORY_OPTIONS.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-brand-dark">Warna (opsional)</span>
          <input
            type="text"
            value={details.color}
            onChange={(event) => setDetails((prev) => ({ ...prev, color: event.target.value }))}
            placeholder="Contoh: Black/White"
            className="rounded-2xl border border-ink-200 bg-white px-4 py-2 text-sm text-brand-dark shadow-inner focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-brand-dark">Material (opsional)</span>
          <input
            type="text"
            value={details.material}
            onChange={(event) => setDetails((prev) => ({ ...prev, material: event.target.value }))}
            placeholder="Contoh: Knit + Rubber"
            className="rounded-2xl border border-ink-200 bg-white px-4 py-2 text-sm text-brand-dark shadow-inner focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          />
        </label>
        <label className="flex flex-col gap-2 sm:col-span-2">
          <span className="text-sm font-semibold text-brand-dark">Harga jual</span>
          <input
            type="number"
            min="0"
            step="1000"
            value={details.price}
            onChange={(event) => setDetails((prev) => ({ ...prev, price: event.target.value }))}
            placeholder="Contoh: 799000"
            className="rounded-2xl border border-ink-200 bg-white px-4 py-2 text-sm text-brand-dark shadow-inner focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          />
        </label>
      </div>
      <div className="flex flex-col gap-3 rounded-3xl border border-ink-100 bg-white/95 p-4 text-sm text-ink-600">
        <p className="font-semibold text-brand-dark">Tips sukses</p>
        <ul className="list-disc space-y-1 pl-5 text-xs">
          <li>Gunakan nama model yang sama dengan label di kotak sepatu.</li>
          <li>Isi warna dan material untuk membantu staff mengenali varian mirip.</li>
          <li>Harga yang Anda input akan digunakan ke semua ukuran di langkah berikutnya.</li>
        </ul>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <Link
          to="/inventory"
          className="rounded-full border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-600 transition hover:border-brand-primary hover:text-brand-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-secondary"
        >
          Batal
        </Link>
        <button
          type="submit"
          className="rounded-full bg-brand-primary px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-secondary"
        >
          Lanjut pilih ukuran
        </button>
      </div>
    </form>
  )

  const variantStep = (
    <form onSubmit={goToReview} className="space-y-6">
      <section className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold text-brand-dark">Pilih skala ukuran</h3>
          <p className="text-xs text-ink-500">Aktifkan ukuran yang tersedia, lalu tentukan stok awal per ukuran.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {SIZE_SCALE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setSizeScale(option.id)}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-secondary ${
                sizeScale === option.id
                  ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                  : 'border-ink-200 text-ink-600 hover:border-brand-primary hover:text-brand-primary'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>
      {sizeScale !== 'CUSTOM' ? (
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Ukuran tersedia</p>
          <div className="flex flex-wrap gap-2">
            {SIZE_SCALE_OPTIONS.find((option) => option.id === sizeScale)?.sizes.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => toggleSize(size)}
                className={`rounded-xl border px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-secondary ${
                  variantSelections[size]
                    ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                    : 'border-ink-200 text-ink-600 hover:border-brand-primary hover:text-brand-primary'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-brand-dark">Tambah ukuran custom</span>
            <div className="flex gap-2">
              <input
                type="text"
                value={customSize}
                onChange={(event) => setCustomSize(event.target.value)}
                placeholder="Contoh: 39.5"
                className="flex-1 rounded-2xl border border-ink-200 bg-white px-4 py-2 text-sm text-brand-dark shadow-inner focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
              />
              <button
                type="button"
                onClick={() => {
                  const value = customSize.trim()
                  if (value) {
                    toggleSize(value)
                    setCustomSize('')
                  }
                }}
                className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
              >
                Tambah
              </button>
            </div>
          </label>
        </div>
      )}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Varian dipilih</p>
        {variantPreview.length === 0 ? (
          <p className="rounded-2xl border border-ink-100 bg-white/90 px-4 py-3 text-sm text-ink-500">
            Aktifkan minimal satu ukuran. Ukuran yang diaktifkan akan menghasilkan SKU otomatis dan dapat diinput stok awalnya.
          </p>
        ) : (
          <div className="space-y-4">
            {variantPreview.map((variant) => (
              <div key={variant.size} className="flex flex-col gap-2 rounded-2xl border border-ink-100 bg-white/95 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-brand-dark">Ukuran {variant.size}</p>
                  <p className="text-xs text-ink-500">SKU pratinjau: {variant.sku}</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-ink-400">Stok awal</label>
                  <input
                    type="number"
                    min="0"
                    value={variantSelections[variant.size]?.quantity ?? 0}
                    onChange={(event) => updateVariantQuantity(variant.size, Number.parseInt(event.target.value, 10) || 0)}
                    className="w-24 rounded-xl border border-ink-200 bg-white px-3 py-1.5 text-right text-sm font-semibold text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="rounded-3xl border border-ink-100 bg-brand-surface/70 p-4 text-xs text-ink-600">
        <p className="font-semibold text-brand-dark">Harga terapkan otomatis</p>
        <p>
          Semua varian menggunakan harga {priceInCents ? currencyFormatter.format(priceInCents / 100) : '-'} yang Anda tetapkan di langkah sebelumnya.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={() => setStep('details')}
          className="rounded-full border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-600 transition hover:border-brand-primary hover:text-brand-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-secondary"
        >
          Kembali ke detail
        </button>
        <button
          type="submit"
          className="rounded-full bg-brand-primary px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-secondary"
        >
          Tinjau & simpan
        </button>
      </div>
    </form>
  )

  const reviewStep = (
    <div className="space-y-6">
      <section className="rounded-3xl border border-ink-100 bg-white/95 p-4 shadow-sm">
        <h3 className="text-lg font-semibold text-brand-dark">Ringkasan detail</h3>
        <dl className="mt-4 grid gap-3 text-sm text-ink-600 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">Brand</dt>
            <dd className="text-brand-dark font-semibold">{selectedBrand?.name ?? details.brandName}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">Model</dt>
            <dd className="text-brand-dark font-semibold">{details.modelName}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">Kategori</dt>
            <dd>{details.category || '-'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">Warna</dt>
            <dd>{details.color || '-'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">Material</dt>
            <dd>{details.material || '-'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">Harga jual</dt>
            <dd>{priceInCents ? currencyFormatter.format(priceInCents / 100) : '-'}</dd>
          </div>
        </dl>
      </section>
      <section className="rounded-3xl border border-ink-100 bg-white/95 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-brand-dark">Varian siap dibuat</h3>
          <button
            type="button"
            onClick={() => setStep('variants')}
            className="text-xs font-semibold uppercase tracking-wide text-brand-primary hover:underline"
          >
            Ubah ukuran
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {variantPreview.map((variant) => (
            <div key={variant.size} className="flex flex-col gap-1 rounded-2xl border border-ink-100 bg-brand-surface/60 p-3 text-sm text-ink-600 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-brand-dark">Ukuran {variant.size}</p>
                <p className="text-xs text-ink-500">SKU: {variant.sku}</p>
              </div>
              <div className="flex gap-4">
                <span className="text-xs uppercase tracking-wide text-ink-400">Stok awal</span>
                <span className="text-sm font-semibold text-brand-dark">{variant.quantity} pasang</span>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-3xl border border-ink-100 bg-white/95 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-brand-dark">Foto ({captures.length})</h3>
          <button
            type="button"
            onClick={() => setStep('details')}
            className="text-xs font-semibold uppercase tracking-wide text-brand-primary hover:underline"
          >
            Tambah foto lagi
          </button>
        </div>
        {captures.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-ink-100 bg-brand-surface/60 px-3 py-3 text-sm text-ink-500">
            Tidak ada foto terlampir. Anda masih bisa menyimpannya sekarang dan menambah foto nanti.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {captures.map((capture) => (
              <img key={capture.id} src={capture.previewUrl} alt="Preview" className="aspect-square w-full rounded-xl object-cover" />
            ))}
          </div>
        )}
      </section>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={() => setStep('variants')}
          className="rounded-full border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-600 transition hover:border-brand-primary hover:text-brand-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-secondary"
        >
          Kembali ke ukuran
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          className="rounded-full bg-brand-primary px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-secondary"
        >
          Simpan & unggah
        </button>
      </div>
    </div>
  )

  const successStep = successSummary ? (
    <div className="space-y-6">
      <section className="rounded-3xl border border-brand-primary/40 bg-white/95 p-5 text-sm text-ink-600 shadow-brand">
        <h3 className="text-xl font-display font-semibold text-brand-dark">Produk siap dijual!</h3>
        <p className="mt-2 text-sm text-ink-600">
          {successSummary.brandName} {successSummary.productName} berhasil dibuat dengan {successSummary.variants.length} varian ukuran dan {successSummary.photoCount} foto pendukung.
        </p>
        <div className="mt-4 space-y-2 text-xs text-ink-500">
          {successSummary.variants.map((variant) => (
            <div key={variant.id} className="flex items-center justify-between rounded-2xl bg-brand-surface/80 px-3 py-2">
              <span className="font-semibold text-brand-dark">
                {variant.size} · SKU {variant.sku}
              </span>
              <span className="text-brand-primary font-semibold">Stok awal {variant.quantity}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <Link
            to="/inventory"
            className="rounded-full border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-600 transition hover:border-brand-primary hover:text-brand-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-secondary"
          >
            Lihat inventori
          </Link>
          {successSummary.variants[0] ? (
            <Link
              to={`/inventory/${successSummary.variants[0].id}`}
              className="rounded-full border border-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary transition hover:bg-brand-primary hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-secondary"
            >
              Edit varian pertama
            </Link>
          ) : null}
        </div>
      </section>
      <section className="rounded-3xl border border-ink-100 bg-white/95 p-4 text-sm text-ink-600">
        <p className="font-semibold text-brand-dark">Butuh input barang berikutnya?</p>
        <p className="mt-1 text-xs text-ink-500">Mulai ulang wizard untuk langsung menambah produk baru dengan kamera dan template yang sama.</p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={resetForm}
            className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-secondary"
          >
            Tambah barang lagi
          </button>
          <button
            type="button"
            onClick={() => navigate('/inventory')}
            className="rounded-full border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-600 transition hover:border-brand-primary hover:text-brand-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-secondary"
          >
            Kembali ke daftar
          </button>
        </div>
      </section>
    </div>
  ) : null

  const renderStep = () => {
    switch (step) {
      case 'details':
        return detailsStep
      case 'variants':
        return variantStep
      case 'review':
        return reviewStep
      case 'success':
        return successStep
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-secondary">Mobile ready</p>
          <h2 className="text-2xl font-display font-semibold text-brand-dark">Tambah Barang Cepat</h2>
          <p className="text-sm text-ink-500">
            Foto, detail, dan varian dapat diselesaikan kurang dari dua menit langsung dari perangkat mobile Anda.
          </p>
        </div>
        <Link
          to="/inventory"
          className="rounded-full border border-ink-200 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-600 transition hover:border-brand-primary hover:text-brand-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-secondary"
        >
          Kembali
        </Link>
      </div>
      {renderCameraSection()}
      {submitError ? <p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">{submitError}</p> : null}
      {submissionProgress ? (
        <div className="flex items-center gap-2 rounded-2xl border border-brand-primary/40 bg-brand-primary/10 px-4 py-2 text-sm font-semibold text-brand-primary">
          <Spinner />
          <span>{submissionProgress}</span>
        </div>
      ) : null}
      <section className="rounded-3xl border border-ink-100 bg-white/95 p-4 shadow-sm">
        <div className="mb-4 flex gap-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
          <span className={step === 'details' ? 'text-brand-primary' : ''}>1. Detail</span>
          <span>›</span>
          <span className={step === 'variants' ? 'text-brand-primary' : ''}>2. Varian</span>
          <span>›</span>
          <span className={step === 'review' ? 'text-brand-primary' : ''}>3. Tinjau</span>
          <span>›</span>
          <span className={step === 'success' ? 'text-brand-primary' : ''}>4. Selesai</span>
        </div>
        {renderStep()}
      </section>
    </div>
  )
}
