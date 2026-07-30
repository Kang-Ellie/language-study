interface Props {
  items: string[]
}

/** 상단 흐르는 배너 (godseng.mom 스타일) */
export default function Marquee({ items }: Props) {
  const line = items.join('     ✦     ')
  return (
    <div className="marquee">
      <div className="marquee-track">
        <span>{line}     ✦     </span>
        <span>{line}     ✦     </span>
      </div>
    </div>
  )
}
