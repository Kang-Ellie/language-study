import { useEffect, useState } from 'react'
import { getImageBlob } from '../lib/imageStore'

interface Props {
  ns: string // 네임스페이스 (courseId 또는 logNamespace)
  file: string
  onClick?: () => void
  className?: string
}

/** IndexedDB에 저장된 이미지를 불러와 <img>로 표시 */
export default function ImageThumb({ ns, file, onClick, className }: Props) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let objUrl: string | null = null
    let alive = true
    getImageBlob(ns, file).then((blob) => {
      if (blob && alive) {
        objUrl = URL.createObjectURL(blob)
        setUrl(objUrl)
      }
    })
    return () => {
      alive = false
      if (objUrl) URL.revokeObjectURL(objUrl)
    }
  }, [ns, file])

  if (!url) return <div className={`img-thumb loading ${className ?? ''}`}>🖼</div>
  return <img className={`img-thumb ${className ?? ''}`} src={url} onClick={onClick} alt="" />
}
